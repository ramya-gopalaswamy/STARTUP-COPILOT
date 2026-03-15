"""
Nova Sonic bidirectional speech-to-speech session manager.

Wraps the experimental aws-sdk-bedrock-runtime to manage a single
bidirectional audio stream with Amazon Nova Sonic.  The caller
(a FastAPI WebSocket handler) feeds in raw PCM audio chunks and
receives back audio bytes + text transcript events.

Hybrid mode (suppress_sonic_audio=True): Sonic handles STT + AI text
generation; the caller uses a separate TTS engine (e.g. Polly) for
speech output with per-shark voices.
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

import os

import boto3
from aws_sdk_bedrock_runtime.client import BedrockRuntimeClient
from aws_sdk_bedrock_runtime.config import Config
from aws_sdk_bedrock_runtime.models import (
    BidirectionalInputPayloadPart,
    InvokeModelWithBidirectionalStreamInputChunk,
    InvokeModelWithBidirectionalStreamOperationInput,
)
from smithy_aws_core.identity.environment import EnvironmentCredentialsResolver

from ..config import AWS_PROFILE, AWS_REGION
from .bedrock_client import NOVA_SONIC_ID

LOG = logging.getLogger(__name__)

INPUT_SAMPLE_RATE = 16000
OUTPUT_SAMPLE_RATE = 24000

DEFAULT_VOICE = "matthew"


def _build_client() -> BedrockRuntimeClient:
    """Build Sonic client using the same pattern as sonic_gateway.py."""
    session = boto3.Session(profile_name=AWS_PROFILE) if AWS_PROFILE else boto3.Session()
    c = session.get_credentials()
    if c is None:
        raise RuntimeError("No AWS credentials available (run `aws sso login`)")
    frozen = c.get_frozen_credentials()
    os.environ["AWS_ACCESS_KEY_ID"] = frozen.access_key
    os.environ["AWS_SECRET_ACCESS_KEY"] = frozen.secret_key
    if frozen.token:
        os.environ["AWS_SESSION_TOKEN"] = frozen.token

    config = Config(
        endpoint_uri=f"https://bedrock-runtime.{AWS_REGION}.amazonaws.com",
        region=AWS_REGION,
        aws_credentials_identity_resolver=EnvironmentCredentialsResolver(),
    )
    return BedrockRuntimeClient(config=config)


@dataclass
class SonicCallbacks:
    """Callbacks the router supplies to receive Sonic output."""
    on_audio: Callable[[bytes], Any] = lambda b: None
    on_text: Callable[[str, str], Any] = lambda role, text: None
    on_assistant_done: Callable[[str], Any] = lambda text: None
    on_end: Callable[[], Any] = lambda: None


@dataclass
class SonicSession:
    """Manages one Nova Sonic bidirectional stream."""

    system_prompt: str
    voice_id: str = DEFAULT_VOICE
    model_id: str = NOVA_SONIC_ID
    callbacks: SonicCallbacks = field(default_factory=SonicCallbacks)
    suppress_sonic_audio: bool = False

    _client: BedrockRuntimeClient | None = field(default=None, repr=False)
    _stream: Any = field(default=None, repr=False)
    _prompt_name: str = field(default_factory=lambda: str(uuid.uuid4()))
    _system_content_name: str = field(default_factory=lambda: str(uuid.uuid4()))
    _audio_content_name: str = field(default_factory=lambda: str(uuid.uuid4()))
    _response_task: asyncio.Task | None = field(default=None, repr=False)
    is_active: bool = field(default=False)
    _in_assistant_response: bool = field(default=False, repr=False)
    _assistant_text_buf: str = field(default="", repr=False)

    async def _send_event(self, event_dict: dict) -> None:
        raw = json.dumps(event_dict).encode("utf-8")
        event_keys = list(event_dict.get("event", {}).keys())
        LOG.debug("Sonic send event: %s (%d bytes)", event_keys, len(raw))
        chunk = InvokeModelWithBidirectionalStreamInputChunk(
            value=BidirectionalInputPayloadPart(bytes_=raw)
        )
        await self._stream.input_stream.send(chunk)

    async def start(self) -> None:
        self._client = _build_client()
        self._stream = await self._client.invoke_model_with_bidirectional_stream(
            InvokeModelWithBidirectionalStreamOperationInput(model_id=self.model_id)
        )
        self.is_active = True

        await self._send_event({
            "event": {
                "sessionStart": {
                    "inferenceConfiguration": {
                        "maxTokens": 1024,
                        "topP": 0.9,
                        "temperature": 0.7,
                    },
                }
            }
        })

        await self._send_event({
            "event": {
                "promptStart": {
                    "promptName": self._prompt_name,
                    "textOutputConfiguration": {"mediaType": "text/plain"},
                    "audioOutputConfiguration": {
                        "mediaType": "audio/lpcm",
                        "sampleRateHertz": OUTPUT_SAMPLE_RATE,
                        "sampleSizeBits": 16,
                        "channelCount": 1,
                        "voiceId": self.voice_id,
                        "encoding": "base64",
                        "audioType": "SPEECH",
                    },
                }
            }
        })

        await self._send_event({
            "event": {
                "contentStart": {
                    "promptName": self._prompt_name,
                    "contentName": self._system_content_name,
                    "type": "TEXT",
                    "interactive": False,
                    "role": "SYSTEM",
                    "textInputConfiguration": {"mediaType": "text/plain"},
                }
            }
        })
        await self._send_event({
            "event": {
                "textInput": {
                    "promptName": self._prompt_name,
                    "contentName": self._system_content_name,
                    "content": self.system_prompt,
                }
            }
        })
        await self._send_event({
            "event": {
                "contentEnd": {
                    "promptName": self._prompt_name,
                    "contentName": self._system_content_name,
                }
            }
        })

        await self._send_event({
            "event": {
                "contentStart": {
                    "promptName": self._prompt_name,
                    "contentName": self._audio_content_name,
                    "type": "AUDIO",
                    "interactive": True,
                    "role": "USER",
                    "audioInputConfiguration": {
                        "mediaType": "audio/lpcm",
                        "sampleRateHertz": INPUT_SAMPLE_RATE,
                        "sampleSizeBits": 16,
                        "channelCount": 1,
                        "audioType": "SPEECH",
                        "encoding": "base64",
                    },
                }
            }
        })

        self._response_task = asyncio.create_task(self._process_responses())
        LOG.info("Sonic session started (voice=%s, suppress_audio=%s)", self.voice_id, self.suppress_sonic_audio)

    async def send_audio(self, pcm_bytes: bytes) -> None:
        if not self.is_active:
            return
        b64 = base64.b64encode(pcm_bytes).decode("utf-8")
        await self._send_event({
            "event": {
                "audioInput": {
                    "promptName": self._prompt_name,
                    "contentName": self._audio_content_name,
                    "content": b64,
                }
            }
        })

    async def send_text(self, text: str, role: str = "USER") -> None:
        if not self.is_active:
            return
        cn = str(uuid.uuid4())
        await self._send_event({
            "event": {
                "contentStart": {
                    "promptName": self._prompt_name,
                    "contentName": cn,
                    "type": "TEXT",
                    "interactive": True,
                    "role": role,
                    "textInputConfiguration": {"mediaType": "text/plain"},
                }
            }
        })
        await self._send_event({
            "event": {
                "textInput": {
                    "promptName": self._prompt_name,
                    "contentName": cn,
                    "content": text,
                }
            }
        })
        await self._send_event({
            "event": {
                "contentEnd": {
                    "promptName": self._prompt_name,
                    "contentName": cn,
                }
            }
        })

    async def stop(self) -> None:
        if not self.is_active:
            return
        self.is_active = False
        try:
            await self._send_event({
                "event": {
                    "contentEnd": {
                        "promptName": self._prompt_name,
                        "contentName": self._audio_content_name,
                    }
                }
            })
            await self._send_event({
                "event": {"promptEnd": {"promptName": self._prompt_name}}
            })
            await self._send_event({"event": {"sessionEnd": {}}})
            await self._stream.input_stream.close()
        except Exception as e:
            LOG.warning("Error closing Sonic session: %s", e)
        if self._response_task and not self._response_task.done():
            self._response_task.cancel()
            try:
                await self._response_task
            except (asyncio.CancelledError, Exception):
                pass
        LOG.info("Sonic session stopped")

    async def _process_responses(self) -> None:
        """Read output events from Sonic and dispatch via callbacks."""
        try:
            output = await self._stream.await_output()
            output_stream = output[1]
            async for event_obj in output_stream:
                if not self.is_active:
                    break
                chunk_bytes = None
                try:
                    if event_obj.value:
                        chunk_bytes = getattr(event_obj.value, "bytes_", None)
                except Exception:
                    pass
                if not chunk_bytes:
                    continue
                try:
                    raw = chunk_bytes.decode("utf-8")
                except Exception:
                    continue
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                event = data.get("event", {})

                if not event:
                    LOG.warning("Sonic non-event response: %s", raw[:500])
                    continue

                if "contentStart" in event:
                    cs = event["contentStart"]
                    role = cs.get("role", "")
                    af = cs.get("additionalModelFields")
                    is_speculative = False
                    if af:
                        try:
                            extra = json.loads(af)
                            is_speculative = extra.get("generationStage") == "SPECULATIVE"
                        except json.JSONDecodeError:
                            pass

                    if role == "ASSISTANT" and is_speculative:
                        self._in_assistant_response = True
                        self._assistant_text_buf = ""

                elif "textOutput" in event:
                    text = event["textOutput"].get("content", "")
                    to_role = event["textOutput"].get("role", "")

                    if self._in_assistant_response:
                        self._assistant_text_buf += text
                    elif to_role == "USER":
                        try:
                            await self.callbacks.on_text("USER", text)
                        except Exception:
                            pass

                elif "audioOutput" in event:
                    if not self.suppress_sonic_audio:
                        audio_b64 = event["audioOutput"].get("content", "")
                        if audio_b64:
                            try:
                                await self.callbacks.on_audio(base64.b64decode(audio_b64))
                            except Exception:
                                pass

                elif "contentEnd" in event:
                    if self._in_assistant_response and self._assistant_text_buf.strip():
                        try:
                            await self.callbacks.on_assistant_done(self._assistant_text_buf)
                        except Exception as e:
                            LOG.warning("on_assistant_done error: %s", e)
                        self._assistant_text_buf = ""
                    self._in_assistant_response = False

                elif "completionEnd" in event:
                    LOG.info("Sonic completionEnd received")

        except StopAsyncIteration:
            pass
        except Exception as e:
            LOG.error("Sonic response error (%s): %s", type(e).__name__, e, exc_info=True)
        finally:
            self.is_active = False
            try:
                await self.callbacks.on_end()
            except Exception:
                pass

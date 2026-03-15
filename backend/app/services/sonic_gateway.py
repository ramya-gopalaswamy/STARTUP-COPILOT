"""
Sonic gateway: bidirectional speech-to-speech with Amazon Nova 2 Sonic via
invoke_model_with_bidirectional_stream. Requires aws_sdk_bedrock_runtime (Python 3.12+).
Used by Virtual Tank for full speech-to-speech (user speaks, shark responds with voice).
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any, Callable, Optional

from ..config import AWS_REGION
from .bedrock_client import get_model

LOG = logging.getLogger(__name__)

INPUT_SAMPLE_RATE = 16000
OUTPUT_SAMPLE_RATE = 24000

START_SESSION = '{"event":{"sessionStart":{"inferenceConfiguration":{"maxTokens":1024,"topP":0.9,"temperature":0.7}}}}'

CONTENT_START_AUDIO = '''{"event":{"contentStart":{"promptName":"%s","contentName":"%s","type":"AUDIO","interactive":true,"role":"USER","audioInputConfiguration":{"mediaType":"audio/lpcm","sampleRateHertz":16000,"sampleSizeBits":16,"channelCount":1,"audioType":"SPEECH","encoding":"base64"}}}}'''

AUDIO_INPUT = '''{"event":{"audioInput":{"promptName":"%s","contentName":"%s","content":"%s"}}}'''

CONTENT_END = '''{"event":{"contentEnd":{"promptName":"%s","contentName":"%s"}}}'''

TEXT_CONTENT_START = '''{"event":{"contentStart":{"promptName":"%s","contentName":"%s","role":"%s","type":"TEXT","interactive":false,"textInputConfiguration":{"mediaType":"text/plain"}}}}'''

TEXT_INPUT = '''{"event":{"textInput":{"promptName":"%s","contentName":"%s","content":"%s"}}}'''

SESSION_END = '{"event":{"sessionEnd":{}}}'


def _prompt_start_json(prompt_name: str, system_text: str, voice_id: str = "matthew") -> str:
    return json.dumps({
        "event": {
            "promptStart": {
                "promptName": prompt_name,
                "textOutputConfiguration": {"mediaType": "text/plain"},
                "audioOutputConfiguration": {
                    "mediaType": "audio/lpcm",
                    "sampleRateHertz": OUTPUT_SAMPLE_RATE,
                    "sampleSizeBits": 16,
                    "channelCount": 1,
                    "voiceId": voice_id,
                    "encoding": "base64",
                    "audioType": "SPEECH",
                },
            }
        }
    })


def _resample_linear(pcm_i16: bytes, from_rate: int, to_rate: int) -> bytes:
    if from_rate == to_rate:
        return pcm_i16
    import array
    arr = array.array("h")
    arr.frombytes(pcm_i16)
    n = len(arr)
    ratio = from_rate / to_rate
    out_n = int(n / ratio)
    out = array.array("h")
    for i in range(out_n):
        idx = i * ratio
        i0 = min(int(idx), n - 1)
        i1 = min(i0 + 1, n - 1)
        frac = idx - int(idx)
        out.append(int(arr[i0] * (1 - frac) + arr[i1] * frac))
    return out.tobytes()


async def _send_event(stream_input: Any, event_json: str) -> None:
    from aws_sdk_bedrock_runtime.models import (
        BidirectionalInputPayloadPart,
        InvokeModelWithBidirectionalStreamInputChunk,
    )
    chunk = InvokeModelWithBidirectionalStreamInputChunk(
        value=BidirectionalInputPayloadPart(bytes_=event_json.encode("utf-8"))
    )
    await stream_input.send(chunk)


class SonicSession:
    """
    Stateful Sonic session: start(), then send_audio(b64) from client;
    output is delivered via on_output(kind, audio_b64, text) callback.
    """

    def __init__(
        self,
        venture_context: str,
        on_output: Callable[[str, Optional[str], Optional[str]], Any],
        model_id: Optional[str] = None,
        region: Optional[str] = None,
        voice_id: str = "matthew",
    ):
        self.venture_context = venture_context[:8000]
        self.on_output = on_output
        self.model_id = model_id or get_model("tank_voice")
        self.region = region or AWS_REGION
        self.voice_id = voice_id
        self._stream_response: Any = None
        self._stream_input: Any = None
        self._prompt_name = str(uuid.uuid4())
        self._audio_content_name = str(uuid.uuid4())
        self._reader_task: Optional[asyncio.Task[None]] = None
        self._closed = False
        self._last_role: str = ""

    async def start(self) -> Optional[str]:
        """Open stream and send init events. Returns error message or None on success."""
        try:
            from aws_sdk_bedrock_runtime.client import (
                BedrockRuntimeClient,
                InvokeModelWithBidirectionalStreamOperationInput,
            )
            from aws_sdk_bedrock_runtime.config import Config
            from smithy_aws_core.identity.environment import EnvironmentCredentialsResolver
        except ImportError as e:
            return f"Sonic requires aws_sdk_bedrock_runtime (pip install aws_sdk_bedrock_runtime). Python 3.12+. {e}"

        config = Config(
            endpoint_uri=f"https://bedrock-runtime.{self.region}.amazonaws.com",
            region=self.region,
            aws_credentials_identity_resolver=EnvironmentCredentialsResolver(),
        )
        client = BedrockRuntimeClient(config=config)
        try:
            self._stream_response = await client.invoke_model_with_bidirectional_stream(
                InvokeModelWithBidirectionalStreamOperationInput(model_id=self.model_id)
            )
        except Exception as e:
            LOG.exception("Sonic invoke_model_with_bidirectional_stream failed: %s", e)
            return str(e)

        self._stream_input = self._stream_response.input_stream
        system_prompt = (
            "You are The Hawk, a Shark Tank-style CFO investor. You are sharp and focused on unit economics, margins, CAC, LTV, and time-to-profitability. "
            "Keep responses very short: one short question or one crisp comment at a time. Sound human and direct. "
            "Venture context for this founder:\n"
            f"{self.venture_context}"
        )

        await _send_event(self._stream_input, START_SESSION)
        await _send_event(
            self._stream_input,
            _prompt_start_json(self._prompt_name, system_prompt, self.voice_id),
        )
        text_content_name = str(uuid.uuid4())
        await _send_event(
            self._stream_input,
            TEXT_CONTENT_START % (self._prompt_name, text_content_name, "SYSTEM"),
        )
        safe_text = system_prompt.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
        await _send_event(
            self._stream_input,
            TEXT_INPUT % (self._prompt_name, text_content_name, safe_text),
        )
        await _send_event(self._stream_input, CONTENT_END % (self._prompt_name, text_content_name))
        await _send_event(
            self._stream_input,
            CONTENT_START_AUDIO % (self._prompt_name, self._audio_content_name),
        )

        self._reader_task = asyncio.create_task(self._read_output())
        return None

    async def _read_output(self) -> None:
        try:
            _, output_stream = await self._stream_response.await_output()
            if not output_stream:
                LOG.warning("Sonic: no output stream")
                return
            async for event in output_stream:
                if self._closed:
                    break
                # Event is a union: Chunk | InternalServerException | ...
                chunk_bytes = None
                try:
                    from aws_sdk_bedrock_runtime.models import InvokeModelWithBidirectionalStreamOutputChunk
                    if isinstance(event, InvokeModelWithBidirectionalStreamOutputChunk) and event.value:
                        chunk_bytes = getattr(event.value, "bytes_", None)
                except Exception:
                    pass
                if not chunk_bytes:
                    continue
                try:
                    data = chunk_bytes.decode("utf-8")
                except Exception:
                    continue
                try:
                    obj = json.loads(data)
                except json.JSONDecodeError:
                    continue
                ev = obj.get("event") or {}
                if "contentStart" in ev:
                    self._last_role = ev["contentStart"].get("role") or ""
                if "audioOutput" in ev:
                    content = ev["audioOutput"].get("content")
                    if content:
                        self.on_output("audio", content, None)
                elif "textOutput" in ev:
                    content = (ev["textOutput"].get("content") or "").strip()
                    if "{ \"interrupted\" : true }" in content:
                        continue
                    if content:
                        kind = "transcript_user" if self._last_role == "USER" else "transcript_assistant"
                        self.on_output(kind, None, content)
                elif "completionEnd" in ev or "sessionEnd" in ev:
                    break
        except asyncio.CancelledError:
            pass
        except Exception as e:
            LOG.exception("Sonic _read_output: %s", e)
            self.on_output("error", None, str(e))
        finally:
            self.on_output("_done", None, None)

    async def send_audio(self, pcm_base64: str, input_sample_rate: int = 16000) -> None:
        """Send one chunk of base64-encoded PCM (16 kHz preferred)."""
        if self._closed or not self._stream_input:
            return
        await _send_event(
            self._stream_input,
            AUDIO_INPUT % (self._prompt_name, self._audio_content_name, pcm_base64),
        )

    async def end_audio_turn(self) -> None:
        """Signal end of user speech (contentEnd for audio). Next user speech would need a new contentStart."""
        if self._closed or not self._stream_input:
            return
        await _send_event(
            self._stream_input,
            CONTENT_END % (self._prompt_name, self._audio_content_name),
        )
        # Start a new audio content for next turn
        self._audio_content_name = str(uuid.uuid4())
        await _send_event(
            self._stream_input,
            CONTENT_START_AUDIO % (self._prompt_name, self._audio_content_name),
        )

    async def close(self) -> None:
        self._closed = True
        if self._reader_task:
            self._reader_task.cancel()
            try:
                await self._reader_task
            except asyncio.CancelledError:
                pass
        if self._stream_input:
            try:
                await _send_event(
                    self._stream_input,
                    CONTENT_END % (self._prompt_name, self._audio_content_name),
                )
                await _send_event(self._stream_input, SESSION_END)
            except Exception:
                pass

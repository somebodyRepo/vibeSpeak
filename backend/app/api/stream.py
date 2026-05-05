import asyncio
import base64
import secrets
from uuid import uuid4

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.config import get_settings
from app.services.asr_service import asr_service

router = APIRouter(tags=["stream"])
settings = get_settings()


@router.websocket("/ws/realtime")
async def realtime_websocket(
    websocket: WebSocket,
    token: str = Query(default="", description="认证 token"),
):
    """
    WebSocket 实时流式转写
    协议：
    - 客户端发送 JSON: {"type": "init", "sample_rate": 16000}
    - 服务端返回: {"type": "ready", "session_id": "xxx"}
    - 客户端发送音频 chunk: {"type": "audio", "data": "base64encoded_pcm_bytes"}
    - 服务端返回结果: {"type": "result", "text": "识别文本", "is_final": false}
    - 客户端发送: {"type": "stop"} 结束会话
    - 服务端返回: {"type": "complete", "session_id": "xxx"}

    认证：通过 query parameter ?token=xxx 或 Authorization header 传递
    """
    # 验证 token（如果启用了认证）
    if settings.auth_enabled:
        # 优先从 query param 获取，其次从 header 获取
        auth_token = token
        if not auth_token:
            auth_header = websocket.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                auth_token = auth_header[7:]  # 去掉 "Bearer " 前缀

        if not auth_token or not secrets.compare_digest(auth_token, settings.auth_token):
            await websocket.accept()
            await websocket.send_json({
                "type": "error",
                "message": "Unauthorized: invalid or missing token",
            })
            await websocket.close(code=1008, reason="Unauthorized")
            return

    await websocket.accept()
    session_id = str(uuid4())
    stream = None
    sample_rate = 16000

    try:
        # Wait for init message first
        init_message = await websocket.receive_json()
        if init_message.get("type") == "init":
            sample_rate = init_message.get("sample_rate", 16000)

        # Initialize stream
        stream = await asr_service.create_stream(session_id)
        await websocket.send_json({
            "type": "ready",
            "session_id": session_id,
            "sample_rate": sample_rate,
        })

        while True:
            try:
                message = await websocket.receive_json()
            except Exception as e:
                print(f"Failed to parse message: {e}")
                break

            msg_type = message.get("type")

            if msg_type == "audio":
                # Decode base64 audio
                audio_data = base64.b64decode(message["data"])

                # Process through ASR
                result = await asr_service.stream_audio_chunk(stream, audio_data)

                if result:
                    await websocket.send_json({
                        "type": "result",
                        "text": result["text"],
                        "is_final": result["is_final"],
                        "current_segment": result.get("current_segment", ""),
                    })

            elif msg_type == "stop":
                # Finalize and return remaining text
                final_text = await asr_service.close_stream(session_id)
                if final_text:
                    await websocket.send_json({
                        "type": "result",
                        "text": final_text,
                        "is_final": True,
                    })
                await websocket.send_json({
                    "type": "complete",
                    "session_id": session_id,
                })
                break

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            elif msg_type == "init":
                # Ignore duplicate init messages
                pass

    except WebSocketDisconnect:
        print(f"WebSocket disconnected: {session_id}")
    except Exception as e:
        print(f"WebSocket error: {e}")
        try:
            await websocket.send_json({
                "type": "error",
                "message": str(e),
            })
        except:
            pass
    finally:
        if session_id in asr_service._streams:
            await asr_service.close_stream(session_id)
        try:
            await websocket.close()
        except:
            pass

import asyncio
from typing import AsyncIterator, Literal, Optional

from openai import AsyncOpenAI

from app.core.config import get_settings

settings = get_settings()

POLISH_SYSTEM_PROMPT = """你是四川方言转标准书面的专家。请对以下ASR转写结果做润色：

要求：
1. 纠正同音错字、口音导致的误识别
2. 四川方言口语 → 标准中文书面表达
3. 删除无意义的语气词和口头禅（"那个""就是说""嗯""啊""嘛"）
4. 理顺语序，合理分句分段
5. 保持原意不变，不添加虚构内容
6. 如有多个说话人，保持对话格式清晰

只返回润色后的纯文本，不要解释，不要添加"润色结果"等标题。"""

SUMMARY_SYSTEM_PROMPT = """你是会议纪要专家。请对以下会议/访谈转写文本生成简洁的会议纪要：

要求：
1. 提取核心议题和结论
2. 记录待办事项（如有）
3. 区分不同发言人的关键观点
4. 控制长度，简明扼要

请用 Markdown 格式输出。"""

FORMAL_STYLE_PROMPT = """你是正式文书专家。请将以下文本转换为正式、规范的书面表达：

要求：
1. 用词正式、准确
2. 语法规范
3. 逻辑严密
4. 适合公文、报告场景

只返回润色后的文本，不要解释。"""

CONCISE_STYLE_PROMPT = """你是精简表达专家。请将以下文本精简为要点：

要求：
1. 去除冗余表达
2. 保留核心信息
3. 使用 bullet points 呈现
4. 适合快速阅读

直接返回要点列表。"""


class LLMService:
    """OpenAI 兼容 API LLM 服务"""

    _instance = None
    _lock = asyncio.Lock()

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = False

    async def initialize(self):
        if self._initialized:
            return

        async with self._lock:
            if self._initialized:
                return

            if settings.llm_base_url and settings.llm_api_key:
                self.client = AsyncOpenAI(
                    api_key=settings.llm_api_key,
                    base_url=settings.llm_base_url,
                    timeout=60.0,
                    max_retries=2,
                )
                self.model = settings.llm_model
            else:
                self.client = None
                self.model = None

            self._initialized = True

    def _get_system_prompt(self, style: Literal["standard", "formal", "concise"]) -> str:
        if style == "formal":
            return FORMAL_STYLE_PROMPT
        elif style == "concise":
            return CONCISE_STYLE_PROMPT
        else:
            return POLISH_SYSTEM_PROMPT

    async def polish_batch(
        self,
        text: str,
        style: Literal["standard", "formal", "concise"] = "standard",
        include_summary: bool = False,
    ) -> tuple[str, Optional[str]]:
        """
        全文润色
        Returns: (polished_text, summary or None)
        """
        await self.initialize()

        if not self.client:
            return text, None

        system_prompt = self._get_system_prompt(style)

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"原文：\n{text}"},
                ],
                temperature=0.3,
            )
            polished = response.choices[0].message.content

            summary = None
            if include_summary:
                summary = await self.generate_summary(text)

            return polished, summary

        except Exception as e:
            print(f"LLM polish error: {e}")
            return text, None

    async def polish_stream(
        self,
        text: str,
        style: Literal["standard", "formal", "concise"] = "standard",
    ) -> AsyncIterator[str]:
        """流式润色"""
        await self.initialize()

        if not self.client:
            yield text
            return

        system_prompt = self._get_system_prompt(style)

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"原文：\n{text}"},
                ],
                temperature=0.3,
                stream=True,
            )
            async for chunk in response:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content

        except Exception as e:
            print(f"LLM stream error: {e}")
            yield text

    async def generate_summary(self, text: str) -> str:
        """生成会议纪要"""
        await self.initialize()

        if not self.client:
            return ""

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
                    {"role": "user", "content": text},
                ],
                temperature=0.3,
            )
            return response.choices[0].message.content

        except Exception as e:
            print(f"Summary error: {e}")
            return ""


# Global instance
llm_service = LLMService()

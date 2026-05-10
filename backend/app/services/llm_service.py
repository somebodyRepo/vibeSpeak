import asyncio
import json
from typing import AsyncIterator, Literal, Optional

from openai import AsyncOpenAI, OpenAI

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
    _sync_lock = None  # 用于同步初始化的锁

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = False
        self._sync_client = None

    def _initialize_sync(self):
        """同步初始化（用于线程池调用）"""
        import threading
        if self._sync_lock is None:
            self._sync_lock = threading.Lock()

        with self._sync_lock:
            if self._initialized:
                return

            if settings.llm_base_url and settings.llm_api_key:
                self._sync_client = OpenAI(
                    api_key=settings.llm_api_key,
                    base_url=settings.llm_base_url,
                    timeout=60.0,
                    max_retries=2,
                )
                self.model = settings.llm_model
            else:
                self._sync_client = None
                self.model = None

            self._initialized = True
            print("LLM service initialized (sync)")

    async def initialize(self):
        if self._initialized:
            return

        async with self._lock:
            if self._initialized:
                return

            if settings.llm_base_url and settings.llm_api_key:
                # 创建异步客户端
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
            print("LLM service initialized (async)")

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

    # ===== 新增: 调研信息提取方法 =====

    EXTRACT_INFO_PROMPT = """你是专业的调研访谈信息提取专家。请根据以下提纲结构，从访谈转写文本中提取关键信息。

## 提纲结构
{outline_json}

## 要求
1. 严格按照提纲板块和问题进行提取
2. 如果某个问题在文本中没有相关信息，标记为"未提及"
3. 提取的信息要准确、简洁，保留关键细节
4. 如果有超出提纲但有价值的信息，放入"补充信息"板块

## 输出格式
请以 Markdown 格式输出，按板块组织，每个问题用加粗显示，答案跟在后面。示例：

## 板块标题
**问题1**: 答案内容
**问题2**: 答案内容

## 补充信息
超出提纲但有价值的信息
"""

    VALIDATE_EXTRACTION_PROMPT = """你是专业的调研访谈质量审核专家。请对以下提取结果进行验证，找出可能遗漏的重要信息。

## 原始转写文本
{transcript}

## 已提取的信息
{extracted_markdown}

## 提纲结构
{outline_json}

## 要求
1. 仔细对比转写文本和提取结果
2. 找出可能被遗漏的重要信息（特别是数字、名称、时间等关键要素）
3. 判断提取的准确性
4. 整理成补充信息

## 输出格式
请以 Markdown 格式输出补充遗漏的信息，直接列出遗漏的内容，格式如下：

## 遗漏信息
- 遗漏点1
- 遗漏点2

如果没有遗漏重要信息，输出：
## 无遗漏
提取结果完整准确。
"""

    FINAL_CONTENT_PROMPT = """你是专业的调研报告撰写专家。请将以下信息整合成一份完整的调研记录。

## 提取信息
{extracted_markdown}

## 补充信息
{supplementary_info}

## 要求
1. 按板块组织内容，结构清晰
2. 信息完整准确，包含补充内容
3. 使用规范的书面表达
4. 保持 Markdown 格式

## 输出格式
请以 Markdown 格式输出完整的调研记录，包含标题和各板块内容。
"""

    async def extract_info_by_outline(
        self,
        transcript: str,
        outline: dict,
    ) -> str:
        """根据提纲从转写文本中提取关键信息，返回 Markdown 格式"""
        await self.initialize()

        if not self.client:
            return ""

        outline_json = json.dumps(outline, ensure_ascii=False, indent=2)
        system_prompt = self.EXTRACT_INFO_PROMPT.format(outline_json=outline_json)

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": transcript},
                ],
                temperature=0.3,
            )
            return response.choices[0].message.content or ""

        except Exception as e:
            print(f"Extract info error: {e}")
            return ""

    async def validate_extraction(
        self,
        transcript: str,
        extracted_markdown: str,
        outline: dict,
    ) -> str:
        """验证提取信息，找出遗漏内容，返回 Markdown 格式"""
        await self.initialize()

        if not self.client:
            return ""

        outline_json = json.dumps(outline, ensure_ascii=False, indent=2)
        system_prompt = self.VALIDATE_EXTRACTION_PROMPT.format(
            transcript=transcript,
            extracted_markdown=extracted_markdown,
            outline_json=outline_json,
        )

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": "请验证并输出结果"},
                ],
                temperature=0.3,
            )
            return response.choices[0].message.content or ""

        except Exception as e:
            print(f"Validate extraction error: {e}")
            return ""

    async def generate_final_content(
        self,
        extracted_markdown: str,
        supplementary_info: str,
    ) -> str:
        """生成最终完善的访谈内容，返回 Markdown 格式"""
        await self.initialize()

        if not self.client:
            return ""

        system_prompt = self.FINAL_CONTENT_PROMPT.format(
            extracted_markdown=extracted_markdown,
            supplementary_info=supplementary_info,
        )

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": "请生成完整的调研记录"},
                ],
                temperature=0.3,
            )
            return response.choices[0].message.content or ""

        except Exception as e:
            print(f"Generate final content error: {e}")
            return ""

    # ===== 同步版本方法（用于线程池调用）=====

    def _ensure_sync_client(self):
        """确保同步客户端已初始化"""
        self._initialize_sync()
        return self._sync_client is not None

    def extract_info_by_outline_sync(
        self,
        transcript: str,
        outline: dict,
    ) -> str:
        """根据提纲从转写文本中提取关键信息（同步版本），返回 Markdown 格式"""
        if not self._ensure_sync_client():
            return ""

        outline_json = json.dumps(outline, ensure_ascii=False, indent=2)
        system_prompt = self.EXTRACT_INFO_PROMPT.format(outline_json=outline_json)

        try:
            response = self._sync_client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": transcript},
                ],
                temperature=0.3,
            )
            return response.choices[0].message.content or ""

        except Exception as e:
            print(f"Extract info sync error: {e}")
            return ""

    def validate_extraction_sync(
        self,
        transcript: str,
        extracted_markdown: str,
        outline: dict,
    ) -> str:
        """验证提取信息，找出遗漏内容（同步版本），返回 Markdown 格式"""
        if not self._ensure_sync_client():
            return ""

        outline_json = json.dumps(outline, ensure_ascii=False, indent=2)
        system_prompt = self.VALIDATE_EXTRACTION_PROMPT.format(
            transcript=transcript,
            extracted_markdown=extracted_markdown,
            outline_json=outline_json,
        )

        try:
            response = self._sync_client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": "请验证并输出结果"},
                ],
                temperature=0.3,
            )
            return response.choices[0].message.content or ""

        except Exception as e:
            print(f"Validate extraction sync error: {e}")
            return ""

    def generate_final_content_sync(
        self,
        extracted_markdown: str,
        supplementary_info: str,
    ) -> str:
        """生成最终完善的访谈内容（同步版本），返回 Markdown 格式"""
        if not self._ensure_sync_client():
            return ""

        system_prompt = self.FINAL_CONTENT_PROMPT.format(
            extracted_markdown=extracted_markdown,
            supplementary_info=supplementary_info,
        )

        try:
            response = self._sync_client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": "请生成完整的调研记录"},
                ],
                temperature=0.3,
            )
            return response.choices[0].message.content or ""

        except Exception as e:
            print(f"Generate final content sync error: {e}")
            return ""


# Global instance
llm_service = LLMService()

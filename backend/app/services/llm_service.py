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
            cls._instance._sync_initialized = False
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
            if self._sync_initialized:
                return

            if settings.llm_base_url and settings.llm_api_key:
                self._sync_client = OpenAI(
                    api_key=settings.llm_api_key,
                    base_url=settings.llm_base_url,
                    timeout=120.0,  # 增加超时时间
                    max_retries=2,
                )
                self.model = settings.llm_model
            else:
                self._sync_client = None
                self.model = None

            self._sync_initialized = True
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
                    timeout=120.0,  # 增加超时时间
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

    # ===== 单访谈 Markdown 结构化文档生成方法 =====

    GENERATE_SESSION_MARKDOWN_PROMPT = """你是专业的调研访谈记录整理专家。请根据以下访谈转写文本和已有的结构化内容，生成一份完整的多维度 Markdown 结构化文档。

## 访谈转写文本（原始记录）
{transcript}

## 已提取的结构化内容
{final_content}

## 要求
请生成一份结构化的 Markdown 文档，包含以下部分：

### 1. 基本信息
- 访谈对象（如有提及）
- 访谈时间/地点（如有提及）
- 访谈主题概述

### 2. 核心发现（按主题组织）
将访谈中的关键信息按主题分类整理，每个主题下列出要点。这是文档的核心内容，需要详细且准确。

### 3. 数据表格（频次/对比类）
如果访谈中包含频次统计、对比分析等数据，请整理成 Markdown 表格格式。例如：
| 类别 | 数量/频次 | 备注 |
|------|-----------|------|
| ... | ... | ... |

### 4. 补充信息
访谈中其他有价值但未归类到核心发现的信息。

### 5. 关键引用（原话）
保留访谈中具有代表性的原话引用，帮助理解上下文。使用引用格式：
> "原话内容"

## 输出格式
请直接输出 Markdown 格式的完整文档，确保结构清晰、内容准确。文档应以一级标题开始，各部分使用二级标题。
"""

    # ===== 单访谈 Markdown 文档生成方法 =====

    async def generate_session_markdown(
        self,
        transcript: str,
        final_content: str,
        custom_prompt: Optional[str] = None,
    ) -> str:
        """根据转写文本和结构化内容生成 Markdown 文档

        Args:
            transcript: 原始转写文本
            final_content: 已提取的结构化内容
            custom_prompt: 自定义提示词模板（可选），如提供则替代默认模板
        """
        await self.initialize()

        if not self.client:
            return ""

        if custom_prompt:
            # 使用自定义提示词，将 {transcript} 和 {final_content} 替换为实际内容
            # 支持用户模板中的占位符
            system_prompt = custom_prompt.replace("{transcript}", transcript).replace("{final_content}", final_content)
        else:
            # 使用默认模板
            system_prompt = self.GENERATE_SESSION_MARKDOWN_PROMPT.format(
                transcript=transcript,
                final_content=final_content,
            )

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": "请生成结构化 Markdown 文档"},
                ],
                temperature=0.3,
            )
            return response.choices[0].message.content or ""

        except Exception as e:
            print(f"Generate session markdown error: {e}")
            return ""

    def generate_session_markdown_sync(
        self,
        transcript: str,
        final_content: str,
        custom_prompt: Optional[str] = None,
    ) -> str:
        """根据转写文本和结构化内容生成 Markdown 文档（同步版本）

        Args:
            transcript: 原始转写文本
            final_content: 已提取的结构化内容
            custom_prompt: 自定义提示词模板（可选）
        """
        if not self._ensure_sync_client():
            return ""

        if custom_prompt:
            system_prompt = custom_prompt.replace("{transcript}", transcript).replace("{final_content}", final_content)
        else:
            system_prompt = self.GENERATE_SESSION_MARKDOWN_PROMPT.format(
                transcript=transcript,
                final_content=final_content,
            )

        try:
            response = self._sync_client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": "请生成结构化 Markdown 文档"},
                ],
                temperature=0.3,
            )
            return response.choices[0].message.content or ""

        except Exception as e:
            print(f"Generate session markdown sync error: {e}")
            return ""

    # ===== 表格整合汇总方法 =====

    SUMMARIZE_MARKDOWN_PROMPT = """你是专业的调研数据分析专家。请将以下多个访谈的结构化文档整合为一个汇总表格。

## 各访谈结构化文档
{session_docs}

## 要求
1. 分析各访谈文档，识别共同的关键维度（如：基本信息、核心观点、问题反馈、建议等）
2. 根据文档内容自动确定表格列标题
3. 每个访谈作为一行，每个维度作为一列
4. 保持数据准确，直接提取原始值
5. 使用 Markdown 表格格式输出
6. 如果某个访谈缺少某个维度的信息，填写"无"或"-"

## 输出格式
请输出 Markdown 格式的表格，结构如下：
| 访谈 | 维度1 | 维度2 | ... |
|------|-------|-------|-----|
| 访谈A | 值 | 值 | ... |
| 访谈B | 值 | 值 | ... |

请确保输出是有效的 Markdown 表格。
"""

    async def summarize_tables(
        self,
        session_docs: list[str],
    ) -> str:
        """整合多个访谈的 Markdown 文档为汇总表格"""
        await self.initialize()

        if not self.client:
            return ""

        # 格式化各个文档
        formatted_docs = []
        for i, doc in enumerate(session_docs):
            formatted_docs.append(f"### 访谈 {i + 1}\n\n{doc}")

        session_docs_text = "\n\n---\n\n".join(formatted_docs)
        system_prompt = self.SUMMARIZE_MARKDOWN_PROMPT.format(
            session_docs=session_docs_text,
        )

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": "请生成汇总表格"},
                ],
                temperature=0.3,
            )
            return response.choices[0].message.content or ""

        except Exception as e:
            print(f"Summarize tables error: {e}")
            return ""

    def summarize_tables_sync(
        self,
        session_docs: list[str],
    ) -> str:
        """整合多个访谈的 Markdown 文档为汇总表格（同步版本）"""
        if not self._ensure_sync_client():
            return ""

        formatted_docs = []
        for i, doc in enumerate(session_docs):
            formatted_docs.append(f"### 访谈 {i + 1}\n\n{doc}")

        session_docs_text = "\n\n---\n\n".join(formatted_docs)
        system_prompt = self.SUMMARIZE_MARKDOWN_PROMPT.format(
            session_docs=session_docs_text,
        )

        try:
            response = self._sync_client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": "请生成汇总表格"},
                ],
                temperature=0.3,
            )
            return response.choices[0].message.content or ""

        except Exception as e:
            print(f"Summarize tables sync error: {e}")
            return ""

    # ===== 多维度汇总报告生成方法 =====

    async def summarize_by_structure(
        self,
        session_docs: list[str],
        structure_prompt: str,
    ) -> str:
        """按维度结构整合多个访谈文档，生成多维度汇总报告

        Args:
            session_docs: 各访谈的 Markdown 文档列表
            structure_prompt: 提示词模板，定义维度结构

        Returns:
            多维度汇总报告（Markdown格式）
        """
        await self.initialize()

        if not self.client:
            return ""

        # 格式化各访谈文档
        formatted_docs = []
        for i, doc in enumerate(session_docs):
            formatted_docs.append(f"### 访谈 {i + 1}\n\n{doc}")

        docs_text = "\n\n---\n\n".join(formatted_docs)

        # 使用结构提示词作为系统提示
        system_prompt = structure_prompt.replace("{transcript}", "").replace("{final_content}", "")

        # 构建用户消息
        user_message = f"""请根据以下各访谈的结构化文档，按照系统提示中定义的维度结构，生成多维度汇总报告。

## 各访谈结构化文档
{docs_text}

## 输出要求
1. 按系统提示定义的维度组织报告
2. 每个维度包含综述描述和汇总表格
3. 综述文字融合所有访谈中该维度的关键信息
4. 体现跨访谈的对比分析
5. 使用规范的 Markdown 格式"""

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                temperature=0.3,
            )
            return response.choices[0].message.content or ""

        except Exception as e:
            print(f"Summarize by structure error: {e}")
            return ""

    def summarize_by_structure_sync(
        self,
        session_docs: list[str],
        structure_prompt: str,
    ) -> str:
        """按维度结构整合多个访谈文档（同步版本）"""
        if not self._ensure_sync_client():
            return ""

        formatted_docs = []
        for i, doc in enumerate(session_docs):
            formatted_docs.append(f"### 访谈 {i + 1}\n\n{doc}")

        docs_text = "\n\n---\n\n".join(formatted_docs)

        system_prompt = structure_prompt.replace("{transcript}", "").replace("{final_content}", "")

        user_message = f"""请根据以下各访谈的结构化文档，按照系统提示中定义的维度结构，生成多维度汇总报告。

## 各访谈结构化文档
{docs_text}

## 输出要求
1. 按系统提示定义的维度组织报告
2. 每个维度包含综述描述和汇总表格
3. 综述文字融合所有访谈中该维度的关键信息
4. 体现跨访谈的对比分析
5. 使用规范的 Markdown 格式"""

        try:
            response = self._sync_client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                temperature=0.3,
            )
            return response.choices[0].message.content or ""

        except Exception as e:
            print(f"Summarize by structure sync error: {e}")
            return ""

    # ===== 提示词模板生成方法 =====

    GENERATE_STRUCTURE_PROMPT_TEMPLATE = """你是专业的调研访谈数据分析专家。请根据以下调研提纲和访谈记录样本，生成一个结构化的提示词模板，用于指导后续生成多维度汇总报告。

## 调研提纲
{outline_json}

## 访谈记录样本（用于参考实际内容类型）
{sample_transcripts}

## 要求
请生成一个多维度结构化的提示词模板，包含以下内容：

### 1. 维度定义
根据提纲和访谈内容，识别出适合汇总分析的核心维度（通常3-5个维度）。每个维度应包含：
- 维度名称（简洁明确）
- 维度描述（说明该维度要分析什么）
- 表格列结构（定义该维度表格的列标题）

### 2. 提示词模板格式
请按以下 Markdown 格式输出提示词模板：

```markdown
# 多维度访谈汇总报告生成提示词

## 维度说明
请按以下维度组织汇总报告，每个维度包含综述描述和汇总表格。

### 维度1: [维度名称]
**描述**: [维度描述]
**表格列**: | 列1 | 列2 | 列3 | ...

### 维度2: [维度名称]
**描述**: [维度描述]
**表格列**: | 列1 | 列2 | 列3 | ...

[继续定义其他维度...]

## 生成要求
1. 每个维度独立成章，包含综述文字和汇总表格
2. 综述文字应融合所有访谈中该维度的关键信息，体现跨访谈对比
3. 表格每行代表一个访谈，每列对应该维度的细分要素
4. 使用规范的 Markdown 格式，表格结构清晰
5. 确保数据准确，直接提取原文信息，不添加主观判断
```

## 输出
请直接输出上述格式的提示词模板，确保维度划分合理、表格结构清晰。
"""

    async def generate_structure_prompt(
        self,
        outline: dict,
        sample_transcripts: list[str],
    ) -> str:
        """根据提纲和访谈样本生成结构化提示词模板"""
        await self.initialize()

        if not self.client:
            return ""

        outline_json = json.dumps(outline, ensure_ascii=False, indent=2)

        # 格式化访谈样本（最多取3个样本，避免过长）
        sample_docs = sample_transcripts[:3]
        formatted_samples = []
        for i, doc in enumerate(sample_docs):
            # 截取前2000字符避免过长
            truncated = doc[:2000] if len(doc) > 2000 else doc
            formatted_samples.append(f"### 样本访谈 {i + 1}\n\n{truncated}")

        sample_text = "\n\n---\n\n".join(formatted_samples) if formatted_samples else "暂无访谈样本"

        system_prompt = self.GENERATE_STRUCTURE_PROMPT_TEMPLATE.format(
            outline_json=outline_json,
            sample_transcripts=sample_text,
        )

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": "请生成结构化提示词模板"},
                ],
                temperature=0.3,
            )
            return response.choices[0].message.content or ""

        except Exception as e:
            print(f"Generate structure prompt error: {e}")
            return ""

    def generate_structure_prompt_sync(
        self,
        outline: dict,
        sample_transcripts: list[str],
    ) -> str:
        """根据提纲和访谈样本生成结构化提示词模板（同步版本）"""
        if not self._ensure_sync_client():
            return ""

        outline_json = json.dumps(outline, ensure_ascii=False, indent=2)

        sample_docs = sample_transcripts[:3]
        formatted_samples = []
        for i, doc in enumerate(sample_docs):
            truncated = doc[:2000] if len(doc) > 2000 else doc
            formatted_samples.append(f"### 样本访谈 {i + 1}\n\n{truncated}")

        sample_text = "\n\n---\n\n".join(formatted_samples) if formatted_samples else "暂无访谈样本"

        system_prompt = self.GENERATE_STRUCTURE_PROMPT_TEMPLATE.format(
            outline_json=outline_json,
            sample_transcripts=sample_text,
        )

        try:
            response = self._sync_client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": "请生成结构化提示词模板"},
                ],
                temperature=0.3,
            )
            return response.choices[0].message.content or ""

        except Exception as e:
            print(f"Generate structure prompt sync error: {e}")
            return ""


# Global instance
llm_service = LLMService()

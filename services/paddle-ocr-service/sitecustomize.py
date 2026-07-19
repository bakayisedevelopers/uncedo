"""Compatibility shims for transitive deps used by PaddleX/PaddleOCR.

PaddleX imports `langchain.docstore.document.Document`, which is no longer
present in newer LangChain package layouts. Provide a minimal alias so the
import path resolves at runtime.
"""

from __future__ import annotations

import sys
import types


def _install_langchain_docstore_alias() -> None:
    Document = None
    try:
        from langchain_core.documents import Document as _Doc  # type: ignore
        Document = _Doc
    except Exception:
        try:
            from langchain_core.documents.base import Document as _Doc  # type: ignore
            Document = _Doc
        except Exception:
            try:
                from langchain.schema import Document as _Doc  # type: ignore
                Document = _Doc
            except Exception:
                return

    docstore_mod = types.ModuleType("langchain.docstore")
    document_mod = types.ModuleType("langchain.docstore.document")
    document_mod.Document = Document

    # Register both import paths used by older callsites.
    if "langchain" in sys.modules:
        setattr(sys.modules["langchain"], "docstore", docstore_mod)
    sys.modules.setdefault("langchain.docstore", docstore_mod)
    sys.modules.setdefault("langchain.docstore.document", document_mod)


_install_langchain_docstore_alias()


def _install_langchain_text_splitter_alias() -> None:
    try:
        from langchain_text_splitters import RecursiveCharacterTextSplitter  # type: ignore
    except Exception:
        return

    text_splitter_mod = types.ModuleType("langchain.text_splitter")
    text_splitter_mod.RecursiveCharacterTextSplitter = RecursiveCharacterTextSplitter

    if "langchain" in sys.modules:
        setattr(sys.modules["langchain"], "text_splitter", text_splitter_mod)
    sys.modules.setdefault("langchain.text_splitter", text_splitter_mod)


_install_langchain_text_splitter_alias()

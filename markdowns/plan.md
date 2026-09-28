Your challenge requirements line up very naturally with this architecture: upload → extract/process → summarize → question answering → answer + source pointer.

1. The architecture I'd use for ASTRA INTEL
                         ASTRA INTEL
                              │
                 ┌────────────┴────────────┐
                 │                         │
            FRONTEND                    BACKEND
          React / Next.js              FastAPI
                 │                         │
                 │       Upload PDF        │
                 └────────────────────────►│
                                           │
                                           ▼
                              ┌──────────────────────┐
                              │   OCR SERVICE        │
                              │ text-extract-api     │
                              │                      │
                              │ FastAPI :8000        │
                              │ Celery               │
                              │ Docling              │
                              │ Ollama               │
                              └──────────┬───────────┘
                                         │
                                  extracted text
                                         │
                                         ▼
                              ┌──────────────────────┐
                              │ Document Processor   │
                              │                      │
                              │ chunking             │
                              │ page metadata        │
                              │ embeddings           │
                              └──────────┬───────────┘
                                         │
                                         ▼
                              ┌──────────────────────┐
                              │ Vector Database      │
                              │ Chroma / FAISS       │
                              └──────────┬───────────┘
                                         │
                              relevant chunks
                                         │
                                         ▼
                              ┌──────────────────────┐
                              │ Local LLM / Ollama   │
                              │                      │
                              │ Answer ONLY from    │
                              │ retrieved chunks     │
                              └──────────┬───────────┘
                                         │
                                         ▼
                              Answer + page citation
                                         │
                                         ▼
                                    FRONTEND

This also leaves room for the bonus requirements like multiple documents, semantic search and document comparison.

Your starter bundle already defines the intended three-document setup: UAV, Electronic Warfare, and UGV.

2. Your current OCR service becomes one component

You have already proved this works:

PDF
 ↓
POST /ocr/upload
 ↓
Celery
 ↓
Docling
 ↓
OCR
 ↓
GET /ocr/result/{task_id}
 ↓
extracted text

Your UGV PDF successfully produced extracted text such as:

## Unmanned ground vehicle

An unmanned ground vehicle (UGV) ...

## History

...

## Design

...

## Sensors

...

## Autonomous

...

## Uses
...

So don't rebuild OCR.

We use your existing text-extract-api.

3. What ASTRA needs to add

The OCR service alone doesn't satisfy the entire challenge.

We need four additional pieces:

A. Document manager

Keeps track of:

document_id
filename
title
upload date
number of pages
OCR task ID
processing status

Your supplied metadata already has this sort of document information.

B. Chunking

Take the extracted document:

10,000+ words

and split it into smaller pieces:

Chunk 1
"An unmanned ground vehicle..."

Chunk 2
"UGVs generally include..."

Chunk 3
"Sensors create a model..."

Chunk 4
"An autonomous UGV..."

...

Each chunk should have metadata:

{
  "document_id": "ugv-001",
  "page": 4,
  "section": "Autonomous",
  "text": "An autonomous UGV..."
}

The page metadata is extremely important because your challenge specifically asks for the relevant section/page.

4. Embeddings + vector database

For every chunk:

chunk
 ↓
embedding model
 ↓
vector
 ↓
vector database

Since you already have Ollama running locally, we can keep the whole system local.

You already have:

bge-m3:latest

available in Ollama.

So we can use:

bge-m3

for embeddings.

For the vector DB, I'd keep the first version simple:

ChromaDB

So:

UGV PDF
   ↓
OCR
   ↓
chunks
   ↓
bge-m3
   ↓
Chroma
5. Then the question flow

Suppose the user asks:

What are the major applications of unmanned ground vehicles?

Your backend does:

Question
   ↓
Embedding
   ↓
Vector search
   ↓
Top 5 relevant chunks
   ↓
Ollama LLM
   ↓
Answer

The LLM receives something like:

DOCUMENT CONTEXT:

[Page 5]
UGVs are used in industries such as agriculture,
mining, and construction.

[Page 6]
UGVs are used in emergency situations including
urban search and rescue, firefighting, and nuclear response.

[Page 6]
Military applications include explosive ordnance
disposal...

QUESTION:
What are the major applications of UGVs?

RULE:
Answer only using the provided context.
If the answer isn't present, say that it isn't
stated in the document.

Then your API returns:

{
  "answer": "The document describes applications in agriculture, mining, construction, emergency response, and military operations such as explosive ordnance disposal.",
  "sources": [
    {
      "document": "Unmanned ground vehicle",
      "page": 5,
      "section": "Uses"
    },
    {
      "document": "Unmanned ground vehicle",
      "page": 6,
      "section": "Emergency response"
    },
    {
      "document": "Unmanned ground vehicle",
      "page": 6,
      "section": "Military"
    }
  ]
}

That's essentially your MUST HAVE #5 + #6.

The provided example-question document explicitly describes the desired pattern as “Answer + source pointer.”

6. The hallucination protection is particularly important

Your supplied test questions actually give us a perfect test.

The question is:

What percentage of UAV missions are fully autonomous?

The correct behavior is:

The provided documents do not contain a statistic
specifying what percentage of UAV missions are fully
autonomous.

Not:

Approximately 60%.

The challenge's example explicitly says this should be an honesty test.

So our RAG prompt should contain something like:

You are ASTRA INTEL.

Answer the user's question ONLY using the supplied
document context.

Rules:
1. Do not use outside knowledge.
2. Do not invent facts, numbers, dates or sources.
3. If the answer isn't present in the context, say:
   "The provided document does not contain this information."
4. Every factual answer must include source pages.
5. Keep the answer concise.
7. Your frontend can then look like this

I'd build ASTRA INTEL around three major areas:

┌──────────────────────────────────────────────────────┐
│ ASTRA INTEL                              + Upload PDF │
├──────────────────────────────────────────────────────┤
│                                                      │
│  DOCUMENTS                 DOCUMENT VIEWER           │
│                                                      │
│  ● UGV.pdf                 Unmanned Ground Vehicle   │
│    15 pages                                          │
│                                                      │
│  ● UAV.pdf                 ┌──────────────────────┐  │
│    50 pages                 │                    │  │
│                             │   PDF / document    │  │
│  ● Electronic               │      viewer        │  │
│    Warfare.pdf              │                    │  │
│                             └──────────────────────┘  │
│                                                      │
├──────────────────────────────────────────────────────┤
│ Ask about this document                              │
│                                                      │
│ ┌──────────────────────────────────────────────────┐ │
│ │ What are the major applications of UGVs?        │ │
│ └──────────────────────────────────────────────────┘ │
│                                             [Ask]    │
├──────────────────────────────────────────────────────┤
│ ANSWER                                               │
│                                                      │
│ UGVs are used in agriculture, mining, construction, │
│ emergency response and military applications...     │
│                                                      │
│ Sources                                              │
│ [Page 5] Uses                                        │
│ [Page 6] Emergency response                          │
│ [Page 6] Military                                    │
└──────────────────────────────────────────────────────┘

That gives you a very clear demo.

8. Your API should eventually look like this

Instead of making the frontend know about:

/ocr/upload
/ocr/result/{task_id}

I'd expose an ASTRA API:

Upload
POST /api/documents

Response:

{
  "document_id": "doc_123",
  "status": "processing"
}
Processing status
GET /api/documents/doc_123

Response:

{
  "document_id": "doc_123",
  "filename": "autonomous-systems-unmanned-ground-vehicle.pdf",
  "status": "ready",
  "pages": 15
}
Ask question
POST /api/documents/doc_123/chat

Body:

{
  "question": "What are the major applications of UGVs?"
}

Response:

{
  "answer": "...",
  "sources": [
    {
      "page": 5,
      "section": "Uses"
    },
    {
      "page": 6,
      "section": "Emergency response"
    }
  ]
}

The frontend only talks to these ASTRA endpoints.

9. One important thing we need to solve: page numbers

Your current OCR result is excellent for text extraction, but it currently comes back as a single large text string.

For example, it gives:

## Unmanned ground vehicle
...

## History
...

## Design
...

but we need:

{
  "page": 1,
  "section": "Introduction",
  "text": "..."
}

because the challenge specifically asks for page-level citations.

The original PDF is 15 pages, so we have the source document available to test this properly.

This is the next technical piece I'd implement before building the chatbot.

10. Your final ASTRA stack

I'd keep it simple and local:

Layer	Technology
Frontend	React / Next.js
Backend	FastAPI
OCR	Your text-extract-api
OCR engine	Docling
Task queue	Celery
Queue	Redis
LLM	Ollama
Embeddings	bge-m3
Vector DB	ChromaDB
PDF viewer	PDF.js / React PDF
Metadata	SQLite initially
RAG	Custom Python RAG pipeline

So you can honestly say:

ASTRA INTEL is an AI-powered document intelligence system using Docling-based document extraction, local embeddings, vector retrieval, and a local LLM to provide grounded answers with document-level and page-level citations.

And importantly, no paid API is required for the core pipeline.

What I suggest we build next

Don't try to build the whole thing at once.

You already completed Step 1: OCR. ✅

Let's do this in order:

STEP 1  ✅ PDF → OCR
        │
STEP 2  ← PAGE-AWARE EXTRACTION
        │
STEP 3  Chunk documents
        │
STEP 4  Embeddings + Chroma
        │
STEP 5  /chat endpoint
        │
STEP 6  Connect frontend
        │
STEP 7  PDF viewer + page citations
        │
STEP 8  Summary
        │
STEP 9  Multi-document search
        │
STEP 10 Polish/demo
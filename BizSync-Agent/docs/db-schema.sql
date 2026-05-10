CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','manager','staff','viewer')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  uploader_id UUID REFERENCES users(id),
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  checksum TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  extracted_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE embeddings (
  id BIGSERIAL PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL,
  embedding vector(1536) NOT NULL
);
CREATE INDEX embeddings_ivf_idx ON embeddings USING ivfflat (embedding vector_cosine_ops);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;

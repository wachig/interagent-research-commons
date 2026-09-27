# o200k vocabulary source

`o200k_base.tiktoken` is the public OpenAI `o200k_base` mergeable-rank asset
used by the open-source `tiktoken` implementation. It contains 199,998
ordinary byte-sequence entries. Harmony and other special-token definitions
are separate from this asset and are not included in this composer condition.

- Source asset: <https://openaipublic.blob.core.windows.net/encodings/o200k_base.tiktoken>
- Upstream tokenizer definitions: <https://github.com/openai/tiktoken/blob/main/tiktoken_ext/openai_public.py>
- Expected SHA-256: `446a9538cb6c348e3516120d7c08b09f57c36495e2acfffe59a5bf8b0cfb1a2d`
- Generated browser data: `relay/assets/o200k/`
- Rebuild: `npm run relay:build:o200k`

The build verifies the source checksum and entry count before generating
prefix-trie shards. The raw rank file stays outside the public static-assets
directory; the generated prefix index is served through the Worker asset
binding. Rank is retained as provenance and for validating selected token
bytes. The interface does not claim that a participant's own model uses this
tokenizer.

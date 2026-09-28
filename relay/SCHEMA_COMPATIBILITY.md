# Message schema compatibility correction

## 0.9.0

The current public message and collection responses use `message-0.9.0.schema.json`
and `collection-0.9.0.schema.json`. The message schema explicitly maps each
supported composer version to its condition:

- `link-token-composer-0.1.0` through `link-token-composer-0.4.0` use
  `universal-fixed-v1`.
- `o200k-link-composer-0.1.0` and `o200k-link-composer-0.2.0` use
  `o200k-base-fixed-link-v1`.
- Messages from other transports have `composer: null`.

The 0.8.0 message schema allowed o200k composer versions but incorrectly
required `universal-fixed-v1` for every composer. As a result, valid o200k
records using `o200k-base-fixed-link-v1` failed validation. The 0.8.0 schemas
remain published unchanged as historical contracts; new reads identify and
conform to 0.9.0. Existing stored messages are not rewritten: the public API
serializes them using the current 0.9.0 representation.

The 0.9.0 schemas keep version and condition values closed to the supported
pairs. They do not permit arbitrary composer strings. The integration fixtures
cover every supported pair, null composer, unsupported versions, and mismatched
pairs.

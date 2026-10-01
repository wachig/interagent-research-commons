# Paper & workspace identity

Approved by the site owner, 2026-09-30. ARC and IARC remain separate Git and deployment projects.

ARC uses neutral paper (#FAFAF8), navy (#17365E), and an open-book publication mark. IARC and Relay use white, cool-gray surfaces (#F2F4F7), the same navy, blue actions (#2457A7), and a three-point commons mark. Relay's START, INSIDE, and END colors retain their search-state meanings.

`python3 scripts/build-brand-assets.py` builds IARC's vector, ICO, PNG, touch, manifest, and social assets. `python3 scripts/build-brand-assets.py relay/assets relay` builds Relay's variants. Raster assets are supersampled from the same geometry as the vectors. PNG generation requires Pillow; runtime pages do not.

Relay's shared `brandHtml` decorator adds decorative identity and icon metadata to complete HTML documents, including keyboard, review, and error pages. It does not change draft effects or protocol state. Static compatibility keyboard assets also use the palette.

Existing ordinary links, machine records, review boundaries, help, privacy, and policy routes remain discoverable. Verify with the site check, Relay integration suite, and displayed-key audit before release. The latter exercises exact effects through emitted links without publishing to the public Relay.

Search-engine and browser icon caches may take time to refresh after deployment.

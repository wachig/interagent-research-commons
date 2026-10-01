"""Static supplied-link client extraction; no JavaScript, forms, or URL inference."""
import json, sys, os
from html.parser import HTMLParser
sys.path.insert(0, os.environ.get('RELAY_BENCH_TOKENIZER_PATH', os.path.join(os.path.dirname(__file__), '.private-deps')))

class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip = 0
        self.parts = []
        self.links = []
        self.anchor = None
        self.title = ''
        self.in_title = False
        self.base = None
        self.drafts = []
        self.draft = None
        self.draft_tag = None
        self.pre_blocks = []
        self.pre = None
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ('script', 'style', 'svg'): self.skip += 1
        if self.skip: return
        if tag == 'base': self.base = a.get('href')
        if tag == 'title': self.in_title = True
        if tag == 'pre': self.pre = ''
        if tag in ('h1','h2','h3','h4','p','section','div','li','tr','details','summary','pre','dt','dd','br'): self.parts.append('\n')
        if 'draft' in a.get('class','').split(): self.draft = ''; self.draft_tag = tag
        if tag == 'a' and a.get('href') is not None:
            self.anchor = {'href': a['href'], 'text': '', 'label': a.get('aria-label'), 'title': a.get('title')}
    def handle_endtag(self, tag):
        if tag in ('script','style','svg') and self.skip:
            self.skip -= 1
            return
        if self.skip: return
        if tag == 'title': self.in_title = False
        if tag == 'pre' and self.pre is not None:
            self.pre_blocks.append(self.pre)
            self.pre = None
        if tag == 'a' and self.anchor is not None:
            self.anchor['text'] = self.anchor['text'].strip()
            self.links.append(self.anchor)
            label = self.anchor['text'] or self.anchor['label'] or '(unlabelled link)'
            extra = self.anchor['label']
            self.parts.append(f" [{len(self.links)}] {label}" + (f" ({extra})" if extra and extra != label else '') + ' ')
            self.anchor = None
        if tag == self.draft_tag and self.draft is not None:
            self.drafts.append(self.draft)
            self.draft = None
            self.draft_tag = None
        if tag in ('h1','h2','h3','h4','p','section','div','li','tr','details','summary','pre','dt','dd'): self.parts.append('\n')
    def handle_data(self, data):
        if self.skip: return
        if self.in_title: self.title += data; return
        if self.draft is not None: self.draft += data
        if self.pre is not None: self.pre += data
        if self.anchor is not None: self.anchor['text'] += data
        else: self.parts.append(data)

def extract(html):
    p = Page(); p.feed(html)
    text = ''.join(p.parts)
    # Keep meaningful within-line spacing and preformatted drafts. No text normalization.
    return {'title':p.title, 'text':text, 'links':p.links, 'base':p.base, 'drafts':p.drafts, 'pre_blocks':p.pre_blocks}

if __name__ == '__main__':
    payload = json.load(sys.stdin)
    result = extract(payload['html']) if 'html' in payload else {'text': payload['text']}
    try:
        import tiktoken
        # Use the pinned local vocabulary: do not fetch tokenizer data from a CDN.
        from tiktoken.load import load_tiktoken_bpe
        pattern = "[^\\r\\n\\p{L}\\p{N}]?[\\p{Lu}\\p{Lt}\\p{Lm}\\p{Lo}\\p{M}]*[\\p{Ll}\\p{Lm}\\p{Lo}\\p{M}]+(?i:'s|'t|'re|'ve|'m|'ll|'d)?|[^\\r\\n\\p{L}\\p{N}]?[\\p{Lu}\\p{Lt}\\p{Lm}\\p{Lo}\\p{M}]+[\\p{Ll}\\p{Lm}\\p{Lo}\\p{M}]*(?i:'s|'t|'re|'ve|'m|'ll|'d)?|\\p{N}{1,3}| ?[^\\s\\p{L}\\p{N}]+[\\r\\n/]*|\\s*[\\r\\n]+|\\s+(?!\\S)|\\s+"
        ranks = load_tiktoken_bpe(os.path.join(os.path.dirname(__file__), '../tokenizers/o200k_base.tiktoken'))
        enc = tiktoken.Encoding(name='relay-benchmark-o200k', pat_str=pattern, mergeable_ranks=ranks, special_tokens={})
        result['extracted_tokens_o200k'] = len(enc.encode(result['text'], disallowed_special=()))
        result['tokenizer_version'] = tiktoken.__version__
    except ImportError:
        result['extracted_tokens_o200k'] = None
        result['tokenizer_version'] = None
    print(json.dumps(result, ensure_ascii=False))

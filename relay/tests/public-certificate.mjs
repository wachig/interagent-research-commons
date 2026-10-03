import assert from 'node:assert/strict';
import {hasPublicReadCertificate} from '../link-browser/public-certificate.mjs';
const read=body=>({verification:{http_status:200,actual_body:body,exact:body==='Hi.',body_sha256:'recorded',measurement_cutoff_at:'2026-10-03T10:00:00Z'}});
assert.equal(hasPublicReadCertificate(read('Hi.'),'Hi.'),true);
assert.equal(hasPublicReadCertificate(read('Hi'),'Hi.'),true);
assert.equal(hasPublicReadCertificate({verification:{http_status:503,actual_body:null}},'Hi.'),false);
assert.equal(hasPublicReadCertificate(read('Hi.'),'Different target'),false);
assert.equal(hasPublicReadCertificate({verification:{...read('Hi').verification,exact:true}},'Hi.'),false);
console.log('Public read certificates freeze exact and inexact measurement cutoffs; failed reads remain retryable.');

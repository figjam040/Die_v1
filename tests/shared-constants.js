// Shared limits used by more than one test file, so they can never disagree.
// CLAUDE_MD_MAX_BYTES matches CLAUDE.md's own standing rule (SIZE RULE: this
// file stays at or under 72,000 bytes, lowered from 80,000 by BUILD 155) and
// F40, asserted in tests/guardrails.test.js.
module.exports = {
  CLAUDE_MD_MAX_BYTES: 72000
};

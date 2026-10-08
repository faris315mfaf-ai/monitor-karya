'use strict';

// Local mitigation for GHSA-vfj7-8cjw-p6xm. Not configurable by pattern input.
// Parser reserves one level for leaves: at most 127 nested brace/paren blocks.
module.exports = depth => {
  if (depth > 128) {
    const error = new SyntaxError('Brace pattern exceeds safe nesting depth (128)');
    error.code = 'BRACES_MAX_DEPTH';
    throw error;
  }
};

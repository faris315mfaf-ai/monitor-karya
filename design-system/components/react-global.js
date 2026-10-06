// Menyediakan React sebagai global untuk bundle.js (implementasi acuan memakai window.React).
import * as React from 'react';
if (typeof window !== 'undefined' && !window.React) window.React = React;

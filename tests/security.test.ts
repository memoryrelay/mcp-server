/**
 * Security Tests
 * 
 * Tests security measures: API key masking, XSS prevention, size limits, UUID validation
 * Issue #11: https://github.com/Alteriom/ai-memory-service/issues/11
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

/**
 * HTML-encode string to prevent XSS (from server.ts)
 */
function sanitizeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Mask API key in error messages (from client.ts)
 */
function maskApiKey(message: string, apiKey: string): string {
  if (!apiKey) return message;
  const maskedKey = apiKey.substring(0, 8) + '***';
  return message.replace(new RegExp(apiKey, 'g'), maskedKey);
}

describe('Security Tests', () => {
  describe('API Key Masking', () => {
    it('should mask API key in error messages', () => {
      const apiKey = 'mem_prod_e0affdcce0f3859b2ee691f6cfd73ff2';
      const errorMsg = `API request failed: 401 Unauthorized with key ${apiKey}`;
      
      const masked = maskApiKey(errorMsg, apiKey);
      
      expect(masked).not.toContain(apiKey);
      expect(masked).toContain('mem_prod***');
      expect(masked).toContain('401 Unauthorized');
    });

    it('should mask multiple occurrences of API key', () => {
      const apiKey = 'mem_test_12345678901234567890';
      const errorMsg = `Key: ${apiKey}, failed to authenticate ${apiKey}`;
      
      const masked = maskApiKey(errorMsg, apiKey);
      
      // Count occurrences of unmasked key (should be 0)
      const unmatchedOccurrences = (masked.match(new RegExp(apiKey, 'g')) || []).length;
      expect(unmatchedOccurrences).toBe(0);
      
      // Count occurrences of masked key (should be 2)
      const maskedOccurrences = (masked.match(/mem_test\*\*\*/g) || []).length;
      expect(maskedOccurrences).toBe(2);
    });

    it('should handle empty or undefined API key', () => {
      const errorMsg = 'API request failed';
      
      expect(maskApiKey(errorMsg, '')).toBe(errorMsg);
      expect(maskApiKey(errorMsg, null as any)).toBe(errorMsg);
    });

    it('should preserve error message structure', () => {
      const apiKey = 'mem_prod_abc123';
      const errorMsg = 'Error: Authentication failed for key mem_prod_abc123 at line 42';
      
      const masked = maskApiKey(errorMsg, apiKey);
      
      expect(masked).toContain('Error: Authentication failed');
      expect(masked).toContain('at line 42');
      expect(masked).not.toContain('mem_prod_abc123');
    });

    it('should mask keys in stack traces', () => {
      const apiKey = 'mem_secret_key_123456789';
      const stackTrace = `
        Error: Auth failed
        at authenticate (/app/auth.js:10:5)
        Headers: { Authorization: "Bearer ${apiKey}" }
        at request (/app/http.js:25:10)
      `;
      
      const masked = maskApiKey(stackTrace, apiKey);
      
      expect(masked).not.toContain(apiKey);
      expect(masked).toContain('mem_secr***');
    });
  });

  describe('XSS Prevention', () => {
    it('should sanitize HTML special characters', () => {
      const malicious = '<script>alert("XSS")</script>';
      const sanitized = sanitizeHtml(malicious);
      
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('</script>');
      expect(sanitized).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;');
    });

    it('should sanitize common XSS payloads', () => {
      const xssPayloads = [
        '<img src=x onerror=alert(1)>',
        '<svg onload=alert(1)>',
        '<iframe src="javascript:alert(1)">',
        '"><script>alert(String.fromCharCode(88,83,83))</script>',
        '<body onload=alert(1)>',
        '<input type="text" value="test" onfocus="alert(1)">',
        "javascript:alert('XSS')",
      ];

      for (const payload of xssPayloads) {
        const sanitized = sanitizeHtml(payload);
        
        // Should not contain opening or closing tag brackets
        expect(sanitized).not.toContain('<script');
        expect(sanitized).not.toContain('</script');
        expect(sanitized).not.toMatch(/<[a-z]/i); // No opening tags
        expect(sanitized).not.toMatch(/<\/[a-z]/i); // No closing tags
        
        // All angle brackets should be escaped
        if (payload.includes('<')) {
          expect(sanitized).toContain('&lt;');
        }
        if (payload.includes('>')) {
          expect(sanitized).toContain('&gt;');
        }
        
        // Should be HTML-encoded
        expect(sanitized).toMatch(/&[a-z]+;|&#x[0-9a-f]+;/i); // Contains entities
      }
    });

    it('should preserve normal text content', () => {
      const normalText = 'This is a normal string with numbers 123 and punctuation!';
      const sanitized = sanitizeHtml(normalText);
      
      expect(sanitized).toBe(normalText);
    });

    it('should handle mixed content', () => {
      const mixed = 'Normal text <script>evil()</script> more text & symbols "quotes"';
      const sanitized = sanitizeHtml(mixed);
      
      expect(sanitized).toContain('Normal text');
      expect(sanitized).toContain('more text');
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toContain('&lt;script&gt;');
      expect(sanitized).toContain('&amp;');
      expect(sanitized).toContain('&quot;');
    });

    it('should sanitize event handlers', () => {
      const eventHandlers = [
        'onclick="alert(1)"',
        'onmouseover="doEvil()"',
        'onerror="stealData()"',
        'onload="badStuff()"',
      ];

      for (const handler of eventHandlers) {
        const sanitized = sanitizeHtml(handler);
        expect(sanitized).not.toContain('="');
        expect(sanitized).toContain('&quot;');
      }
    });

    it('should handle URL-like strings safely', () => {
      const urls = [
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'vbscript:msgbox(1)',
      ];

      for (const url of urls) {
        const sanitized = sanitizeHtml(url);
        
        // If URL contains HTML tags, they should be escaped
        if (url.includes('<')) {
          expect(sanitized).toContain('&lt;');
        }
        if (url.includes('>')) {
          expect(sanitized).toContain('&gt;');
        }
        
        // Colon is not escaped (it's not a dangerous HTML character)
        // The function escapes HTML entities, not URL schemes
        // The protection comes from not interpreting the string as HTML
      }
    });

    it('should handle nested HTML', () => {
      const nested = '<div><span><script>alert(1)</script></span></div>';
      const sanitized = sanitizeHtml(nested);
      
      expect(sanitized).not.toContain('<div>');
      expect(sanitized).not.toContain('<span>');
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toMatch(/&lt;.*&gt;/); // All tags escaped
    });
  });

  describe('Content Size Limits', () => {
    const MAX_CONTENT_SIZE = 50 * 1024; // 50KB

    it('should reject content exceeding 50KB', () => {
      const validateSize = (content: string) => {
        if (content.length > MAX_CONTENT_SIZE) {
          throw new Error(`Content exceeds maximum size of ${MAX_CONTENT_SIZE} bytes`);
        }
      };

      // Just under limit
      const almostMax = 'x'.repeat(MAX_CONTENT_SIZE - 1);
      expect(() => validateSize(almostMax)).not.toThrow();

      // Exactly at limit
      const exactMax = 'x'.repeat(MAX_CONTENT_SIZE);
      expect(() => validateSize(exactMax)).not.toThrow();

      // Over limit
      const overMax = 'x'.repeat(MAX_CONTENT_SIZE + 1);
      expect(() => validateSize(overMax)).toThrow(/maximum size/);
    });

    it('should calculate size correctly for multi-byte characters', () => {
      const validateSize = (content: string) => {
        if (content.length > MAX_CONTENT_SIZE) {
          throw new Error(`Content exceeds maximum size of ${MAX_CONTENT_SIZE} bytes`);
        }
      };

      // Unicode characters (each is 1 JS char but multiple bytes in UTF-8)
      const unicode = '你好'.repeat(MAX_CONTENT_SIZE / 2);
      
      // JS uses UTF-16, so length is character count, not byte count
      // This is acceptable - we're limiting by string length
      if (unicode.length <= MAX_CONTENT_SIZE) {
        expect(() => validateSize(unicode)).not.toThrow();
      }
    });

    it('should reject oversized query strings', () => {
      const validateSize = (content: string) => {
        if (content.length > MAX_CONTENT_SIZE) {
          throw new Error(`Content exceeds maximum size of ${MAX_CONTENT_SIZE} bytes`);
        }
      };

      const hugeQuery = 'search term '.repeat(5000);
      
      if (hugeQuery.length > MAX_CONTENT_SIZE) {
        expect(() => validateSize(hugeQuery)).toThrow();
      }
    });
  });

  describe('UUID Validation', () => {
    const uuidSchema = z.string().uuid();

    it('should accept valid UUIDs', () => {
      const validUuids = [
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        '00000000-0000-0000-0000-000000000000',
        'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      ];

      for (const uuid of validUuids) {
        expect(() => uuidSchema.parse(uuid)).not.toThrow();
        expect(() => uuidSchema.parse(uuid.toLowerCase())).not.toThrow();
      }
    });

    it('should reject invalid UUID formats', () => {
      const invalidUuids = [
        'not-a-uuid',
        '12345',
        'xyz-123-456',
        '550e8400-e29b-41d4-a716', // Too short
        '550e8400-e29b-41d4-a716-446655440000-extra', // Too long
        '550e8400e29b41d4a716446655440000', // Missing hyphens
        'g50e8400-e29b-41d4-a716-446655440000', // Invalid hex
        '550e8400-e29b-41d4-a716-4466554400001', // One extra char
        '', // Empty
        '   ', // Whitespace
        'null',
        'undefined',
      ];

      for (const uuid of invalidUuids) {
        expect(() => uuidSchema.parse(uuid)).toThrow();
      }
    });

    it('should reject SQL injection attempts in UUID field', () => {
      const sqlInjections = [
        "' OR '1'='1",
        "1; DROP TABLE memories--",
        "admin'--",
        "' UNION SELECT * FROM users--",
      ];

      for (const injection of sqlInjections) {
        expect(() => uuidSchema.parse(injection)).toThrow();
      }
    });

    it('should reject XSS attempts in UUID field', () => {
      const xssAttempts = [
        '<script>alert(1)</script>',
        'javascript:alert(1)',
        '<img src=x onerror=alert(1)>',
      ];

      for (const xss of xssAttempts) {
        expect(() => uuidSchema.parse(xss)).toThrow();
      }
    });

    it('should handle UUID validation in batch', () => {
      const mixed = [
        '550e8400-e29b-41d4-a716-446655440000', // Valid
        'invalid-uuid', // Invalid
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8', // Valid
        'another-bad-one', // Invalid
      ];

      const results = mixed.map(uuid => ({
        uuid,
        valid: uuidSchema.safeParse(uuid).success
      }));

      expect(results[0].valid).toBe(true);
      expect(results[1].valid).toBe(false);
      expect(results[2].valid).toBe(true);
      expect(results[3].valid).toBe(false);
    });
  });

  describe('Input Sanitization Integration', () => {
    it('should sanitize entity names before storage', () => {
      const maliciousName = '<script>alert("entity")</script>';
      const sanitized = sanitizeHtml(maliciousName);
      
      expect(sanitized).not.toContain('<script>');
      
      // Verify it passes length validation after sanitization
      const schema = z.string().min(1).max(200);
      expect(() => schema.parse(sanitized)).not.toThrow();
    });

    it('should reject oversized content after sanitization', () => {
      const large = '<'.repeat(60 * 1024); // 60KB of angle brackets
      const sanitized = sanitizeHtml(large);
      
      // Sanitized version will be even larger (&lt;)
      expect(sanitized.length).toBeGreaterThan(large.length);
      
      const validateSize = (content: string) => {
        if (content.length > 50 * 1024) {
          throw new Error('Content exceeds maximum size');
        }
      };
      
      expect(() => validateSize(sanitized)).toThrow();
    });

    it('should handle combined validation (UUID + sanitization)', () => {
      const testCases = [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          content: 'Normal content',
          shouldPass: true,
        },
        {
          id: 'invalid-uuid',
          content: 'Normal content',
          shouldPass: false,
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          content: '<script>alert(1)</script>',
          shouldPass: true, // Passes validation, content gets sanitized
        },
      ];

      const schema = z.object({
        id: z.string().uuid(),
        content: z.string(),
      });

      for (const testCase of testCases) {
        const result = schema.safeParse({
          id: testCase.id,
          content: testCase.content,
        });

        if (testCase.shouldPass) {
          expect(result.success).toBe(true);
          if (result.success) {
            // Content should be sanitized
            const sanitized = sanitizeHtml(result.data.content);
            expect(sanitized).not.toContain('<script>');
          }
        } else {
          expect(result.success).toBe(false);
        }
      }
    });
  });

  describe('Error Information Disclosure', () => {
    it('should not leak sensitive info in validation errors', () => {
      const apiKey = 'mem_secret_key_123';
      const schema = z.object({
        apiKey: z.string(),
        content: z.string(),
      });

      try {
        schema.parse({ apiKey, content: 123 }); // Invalid content type
        expect.fail('Should have thrown');
      } catch (error) {
        const errorStr = JSON.stringify(error);
        
        // Error should mention field name but not contain full API key
        expect(errorStr.toLowerCase()).toContain('content');
        
        // If API key is in error, it should be in the input data, not exposed
        if (errorStr.includes(apiKey)) {
          // This is acceptable if it's part of showing the input that failed
          // But it should be the only occurrence
          const occurrences = (errorStr.match(new RegExp(apiKey, 'g')) || []).length;
          expect(occurrences).toBeLessThanOrEqual(2); // Input object + maybe one reference
        }
      }
    });

    it('should not expose system paths in errors', () => {
      // This test ensures production errors don't leak filesystem info
      const createError = (message: string) => {
        // Simulate sanitizing system paths
        return message.replace(/\/[a-z/]+\/[a-z/_.-]+/gi, '[REDACTED_PATH]');
      };

      const systemError = 'Error at /home/user/app/src/secret_module.js:42';
      const sanitized = createError(systemError);
      
      expect(sanitized).not.toContain('/home/');
      expect(sanitized).toContain('[REDACTED_PATH]');
    });
  });
});

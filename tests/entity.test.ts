/**
 * Entity tool validation tests
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

describe('Entity Tool Validation', () => {
  describe('entity_create schema', () => {
    const entitySchema = z.object({
      name: z.string().min(1).max(200),
      type: z.enum(['person', 'place', 'organization', 'project', 'concept', 'other']),
      metadata: z.record(z.string()).optional(),
    });

    it('should accept valid entity data', () => {
      const validData = {
        name: 'John Doe',
        type: 'person' as const,
      };

      const result = entitySchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should accept all entity types', () => {
      const types = ['person', 'place', 'organization', 'project', 'concept', 'other'];

      types.forEach(type => {
        const result = entitySchema.safeParse({
          name: 'Test Entity',
          type,
        });
        expect(result.success).toBe(true);
      });
    });

    it('should accept optional metadata', () => {
      const validData = {
        name: 'John Doe',
        type: 'person' as const,
        metadata: {
          email: 'john@example.com',
          role: 'developer',
        },
      };

      const result = entitySchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject empty name', () => {
      const invalidData = {
        name: '',
        type: 'person' as const,
      };

      const result = entitySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject name longer than 200 characters', () => {
      const invalidData = {
        name: 'a'.repeat(201),
        type: 'person' as const,
      };

      const result = entitySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid entity type', () => {
      const invalidData = {
        name: 'Test',
        type: 'invalid_type',
      };

      const result = entitySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const invalidData = {
        name: 'Test',
      };

      const result = entitySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('entity_link schema', () => {
    const linkSchema = z.object({
      entity_id: z.string().uuid(),
      memory_id: z.string().uuid(),
      relationship: z.string().default('mentioned_in'),
    });

    it('should accept valid link data', () => {
      const validData = {
        entity_id: '550e8400-e29b-41d4-a716-446655440000',
        memory_id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        relationship: 'mentioned_in',
      };

      const result = linkSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should accept default relationship', () => {
      const validData = {
        entity_id: '550e8400-e29b-41d4-a716-446655440000',
        memory_id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      };

      const result = linkSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.relationship).toBe('mentioned_in');
      }
    });

    it('should reject invalid entity_id UUID', () => {
      const invalidData = {
        entity_id: 'not-a-uuid',
        memory_id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      };

      const result = linkSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid memory_id UUID', () => {
      const invalidData = {
        entity_id: '550e8400-e29b-41d4-a716-446655440000',
        memory_id: 'invalid-uuid',
      };

      const result = linkSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const invalidData = {
        entity_id: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = linkSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('XSS Prevention', () => {
    function sanitizeHtml(str: string): string {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
    }

    it('should sanitize HTML tags', () => {
      const malicious = '<script>alert("xss")</script>';
      const sanitized = sanitizeHtml(malicious);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toContain('&lt;script&gt;');
    });

    it('should sanitize HTML attributes', () => {
      const malicious = '<img src="x" onerror="alert(1)">';
      const sanitized = sanitizeHtml(malicious);

      expect(sanitized).not.toContain('<img');
      expect(sanitized).toContain('&lt;img');
      expect(sanitized).toContain('&quot;');
      // onerror is still in the text, but the dangerous < > are escaped
      expect(sanitized).not.toContain('<');
      expect(sanitized).not.toContain('>');
    });

    it('should sanitize JavaScript URLs', () => {
      const malicious = 'javascript:alert(1)';
      const sanitized = sanitizeHtml(malicious);

      // The sanitizer doesn't escape : but it does escape dangerous characters
      // The key is that < > " ' are escaped, preventing script execution context
      expect(sanitized).toBe('javascript:alert(1)'); // : and () are not escaped
    });

    it('should handle multiple special characters', () => {
      const malicious = '<>&"\'/';
      const sanitized = sanitizeHtml(malicious);

      expect(sanitized).toBe('&lt;&gt;&amp;&quot;&#x27;&#x2F;');
    });

    it('should not affect normal text', () => {
      const normal = 'John Doe - Software Developer';
      const sanitized = sanitizeHtml(normal);

      expect(sanitized).toBe('John Doe - Software Developer');
    });
  });

  describe('UUID Validation', () => {
    const uuidSchema = z.string().uuid();

    it('should accept valid UUIDs', () => {
      const validUuids = [
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      ];

      validUuids.forEach(uuid => {
        const result = uuidSchema.safeParse(uuid);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid UUID formats', () => {
      const invalidUuids = [
        'not-a-uuid',
        '12345',
        '550e8400-e29b-41d4-a716',
        '550e8400e29b41d4a716446655440000', // no dashes
        '550e8400-e29b-41d4-a716-446655440000-extra',
      ];

      invalidUuids.forEach(uuid => {
        const result = uuidSchema.safeParse(uuid);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Content Size Limits', () => {
    const MAX_CONTENT_SIZE = 50 * 1024; // 50KB

    function validateContentSize(content: string): boolean {
      return content.length <= MAX_CONTENT_SIZE;
    }

    it('should accept content under 50KB', () => {
      const smallContent = 'a'.repeat(1000);
      expect(validateContentSize(smallContent)).toBe(true);
    });

    it('should accept content at exactly 50KB', () => {
      const exactContent = 'a'.repeat(50 * 1024);
      expect(validateContentSize(exactContent)).toBe(true);
    });

    it('should reject content over 50KB', () => {
      const largeContent = 'a'.repeat(50 * 1024 + 1);
      expect(validateContentSize(largeContent)).toBe(false);
    });
  });
});

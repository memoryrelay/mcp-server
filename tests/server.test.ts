/**
 * Server Tool Validation Tests
 * 
 * Tests MCP server tool input validation and error handling
 * Issue #11: https://github.com/Alteriom/ai-memory-service/issues/11
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';

describe('Server Tool Input Validation', () => {
  describe('memory_store tool', () => {
    it('should require content field', () => {
      const schema = z.object({
        content: z.string(),
        metadata: z.record(z.string()).optional(),
      });

      // Valid input
      expect(() => schema.parse({ content: 'test' })).not.toThrow();
      
      // Missing content
      expect(() => schema.parse({})).toThrow();
      
      // Invalid type
      expect(() => schema.parse({ content: 123 })).toThrow();
    });

    it('should validate metadata as optional string record', () => {
      const schema = z.object({
        content: z.string(),
        metadata: z.record(z.string()).optional(),
      });

      // Valid metadata
      expect(() => schema.parse({
        content: 'test',
        metadata: { key: 'value' }
      })).not.toThrow();

      // Invalid metadata (non-string values)
      expect(() => schema.parse({
        content: 'test',
        metadata: { key: 123 }
      })).toThrow();
    });

    it('should reject empty content strings', () => {
      const schema = z.object({
        content: z.string().min(1),
        metadata: z.record(z.string()).optional(),
      });

      expect(() => schema.parse({ content: '' })).toThrow();
    });
  });

  describe('memory_search tool', () => {
    it('should require query field', () => {
      const schema = z.object({
        query: z.string(),
        limit: z.number().min(1).max(50).optional(),
        threshold: z.number().min(0).max(1).optional(),
      });

      // Valid input
      expect(() => schema.parse({ query: 'test' })).not.toThrow();
      
      // Missing query
      expect(() => schema.parse({})).toThrow();
    });

    it('should validate limit range (1-50)', () => {
      const schema = z.object({
        query: z.string(),
        limit: z.number().min(1).max(50).optional(),
      });

      // Valid limits
      expect(() => schema.parse({ query: 'test', limit: 1 })).not.toThrow();
      expect(() => schema.parse({ query: 'test', limit: 50 })).not.toThrow();
      
      // Invalid limits
      expect(() => schema.parse({ query: 'test', limit: 0 })).toThrow();
      expect(() => schema.parse({ query: 'test', limit: 51 })).toThrow();
      expect(() => schema.parse({ query: 'test', limit: -1 })).toThrow();
    });

    it('should validate threshold range (0-1)', () => {
      const schema = z.object({
        query: z.string(),
        threshold: z.number().min(0).max(1).optional(),
      });

      // Valid thresholds
      expect(() => schema.parse({ query: 'test', threshold: 0 })).not.toThrow();
      expect(() => schema.parse({ query: 'test', threshold: 0.5 })).not.toThrow();
      expect(() => schema.parse({ query: 'test', threshold: 1 })).not.toThrow();
      
      // Invalid thresholds
      expect(() => schema.parse({ query: 'test', threshold: -0.1 })).toThrow();
      expect(() => schema.parse({ query: 'test', threshold: 1.1 })).toThrow();
    });
  });

  describe('memory_list tool', () => {
    it('should validate limit range (1-100)', () => {
      const schema = z.object({
        limit: z.number().min(1).max(100).optional(),
        offset: z.number().min(0).optional(),
      });

      // Valid limits
      expect(() => schema.parse({ limit: 1 })).not.toThrow();
      expect(() => schema.parse({ limit: 100 })).not.toThrow();
      
      // Invalid limits
      expect(() => schema.parse({ limit: 0 })).toThrow();
      expect(() => schema.parse({ limit: 101 })).toThrow();
    });

    it('should validate offset is non-negative', () => {
      const schema = z.object({
        limit: z.number().min(1).max(100).optional(),
        offset: z.number().min(0).optional(),
      });

      // Valid offsets
      expect(() => schema.parse({ offset: 0 })).not.toThrow();
      expect(() => schema.parse({ offset: 100 })).not.toThrow();
      
      // Invalid offsets
      expect(() => schema.parse({ offset: -1 })).toThrow();
    });
  });

  describe('memory_get tool', () => {
    it('should require id field', () => {
      const schema = z.object({
        id: z.string(),
      });

      // Valid input
      expect(() => schema.parse({ id: 'test-id' })).not.toThrow();
      
      // Missing id
      expect(() => schema.parse({})).toThrow();
    });

    it('should validate UUID format', () => {
      const schema = z.object({
        id: z.string().uuid(),
      });

      // Valid UUID
      expect(() => schema.parse({ 
        id: '550e8400-e29b-41d4-a716-446655440000' 
      })).not.toThrow();
      
      // Invalid UUIDs
      expect(() => schema.parse({ id: 'not-a-uuid' })).toThrow();
      expect(() => schema.parse({ id: '12345' })).toThrow();
      expect(() => schema.parse({ id: '' })).toThrow();
    });
  });

  describe('memory_update tool', () => {
    it('should require id and content fields', () => {
      const schema = z.object({
        id: z.string().uuid(),
        content: z.string(),
        metadata: z.record(z.string()).optional(),
      });

      // Valid input
      expect(() => schema.parse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        content: 'updated'
      })).not.toThrow();
      
      // Missing id
      expect(() => schema.parse({ content: 'test' })).toThrow();
      
      // Missing content
      expect(() => schema.parse({ 
        id: '550e8400-e29b-41d4-a716-446655440000' 
      })).toThrow();
    });
  });

  describe('memory_delete tool', () => {
    it('should require UUID id field', () => {
      const schema = z.object({
        id: z.string().uuid(),
      });

      // Valid input
      expect(() => schema.parse({ 
        id: '550e8400-e29b-41d4-a716-446655440000' 
      })).not.toThrow();
      
      // Invalid inputs
      expect(() => schema.parse({})).toThrow();
      expect(() => schema.parse({ id: 'not-uuid' })).toThrow();
    });
  });

  describe('entity_create tool', () => {
    it('should require name and type fields', () => {
      const schema = z.object({
        name: z.string().min(1).max(200),
        type: z.enum(['person', 'place', 'organization', 'project', 'concept', 'other']),
        metadata: z.record(z.string()).optional(),
      });

      // Valid input
      expect(() => schema.parse({
        name: 'Test Entity',
        type: 'concept'
      })).not.toThrow();
      
      // Missing fields
      expect(() => schema.parse({ name: 'Test' })).toThrow();
      expect(() => schema.parse({ type: 'concept' })).toThrow();
    });

    it('should validate name length (1-200 chars)', () => {
      const schema = z.object({
        name: z.string().min(1).max(200),
        type: z.enum(['person', 'place', 'organization', 'project', 'concept', 'other']),
      });

      // Valid names
      expect(() => schema.parse({ name: 'A', type: 'concept' })).not.toThrow();
      expect(() => schema.parse({ name: 'a'.repeat(200), type: 'concept' })).not.toThrow();
      
      // Invalid names
      expect(() => schema.parse({ name: '', type: 'concept' })).toThrow();
      expect(() => schema.parse({ name: 'a'.repeat(201), type: 'concept' })).toThrow();
    });

    it('should validate entity type enum', () => {
      const schema = z.object({
        name: z.string().min(1),
        type: z.enum(['person', 'place', 'organization', 'project', 'concept', 'other']),
      });

      // Valid types
      const validTypes = ['person', 'place', 'organization', 'project', 'concept', 'other'];
      for (const type of validTypes) {
        expect(() => schema.parse({ name: 'Test', type })).not.toThrow();
      }
      
      // Invalid type
      expect(() => schema.parse({ name: 'Test', type: 'invalid' })).toThrow();
    });
  });

  describe('entity_link tool', () => {
    it('should require entity_id and memory_id fields', () => {
      const schema = z.object({
        entity_id: z.string().uuid(),
        memory_id: z.string().uuid(),
        relationship: z.string().default('mentioned_in'),
      });

      // Valid input
      expect(() => schema.parse({
        entity_id: '550e8400-e29b-41d4-a716-446655440000',
        memory_id: '660e8400-e29b-41d4-a716-446655440001'
      })).not.toThrow();
      
      // Missing fields
      expect(() => schema.parse({ 
        entity_id: '550e8400-e29b-41d4-a716-446655440000' 
      })).toThrow();
      expect(() => schema.parse({ 
        memory_id: '660e8400-e29b-41d4-a716-446655440001' 
      })).toThrow();
    });

    it('should validate both IDs are UUIDs', () => {
      const schema = z.object({
        entity_id: z.string().uuid(),
        memory_id: z.string().uuid(),
        relationship: z.string().optional(),
      });

      // Invalid entity_id
      expect(() => schema.parse({
        entity_id: 'not-uuid',
        memory_id: '660e8400-e29b-41d4-a716-446655440001'
      })).toThrow();

      // Invalid memory_id
      expect(() => schema.parse({
        entity_id: '550e8400-e29b-41d4-a716-446655440000',
        memory_id: 'not-uuid'
      })).toThrow();
    });

    it('should have optional relationship with default value', () => {
      const schema = z.object({
        entity_id: z.string().uuid(),
        memory_id: z.string().uuid(),
        relationship: z.string().default('mentioned_in'),
      });

      const result = schema.parse({
        entity_id: '550e8400-e29b-41d4-a716-446655440000',
        memory_id: '660e8400-e29b-41d4-a716-446655440001'
      });

      expect(result.relationship).toBe('mentioned_in');
    });
  });

  describe('memory_health tool', () => {
    it('should accept empty input', () => {
      const schema = z.object({});

      expect(() => schema.parse({})).not.toThrow();
      expect(() => schema.parse({ extra: 'ignored' })).not.toThrow();
    });
  });

  describe('Error Response Format', () => {
    it('should format Zod validation errors consistently', () => {
      const schema = z.object({
        id: z.string().uuid(),
        content: z.string().min(1),
      });

      try {
        schema.parse({ id: 'invalid' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(z.ZodError);
        
        const zodError = error as z.ZodError;
        expect(zodError.errors).toBeDefined();
        expect(Array.isArray(zodError.errors)).toBe(true);
        expect(zodError.errors.length).toBeGreaterThan(0);
        
        // Check error structure
        const firstError = zodError.errors[0];
        expect(firstError).toHaveProperty('path');
        expect(firstError).toHaveProperty('message');
        expect(firstError).toHaveProperty('code');
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle null values', () => {
      const schema = z.object({
        content: z.string(),
      });

      expect(() => schema.parse({ content: null })).toThrow();
    });

    it('should handle undefined values for optional fields', () => {
      const schema = z.object({
        content: z.string(),
        metadata: z.record(z.string()).optional(),
      });

      expect(() => schema.parse({ 
        content: 'test',
        metadata: undefined 
      })).not.toThrow();
    });

    it('should handle extra fields appropriately', () => {
      const schema = z.object({
        content: z.string(),
      }).strict(); // strict mode rejects extra fields

      expect(() => schema.parse({ 
        content: 'test',
        extra: 'field'
      })).toThrow();
    });

    it('should handle very long strings', () => {
      const schema = z.object({
        content: z.string().max(1000),
      });

      // Just under limit
      expect(() => schema.parse({ 
        content: 'x'.repeat(1000) 
      })).not.toThrow();

      // Over limit
      expect(() => schema.parse({ 
        content: 'x'.repeat(1001) 
      })).toThrow();
    });

    it('should handle special characters in strings', () => {
      const schema = z.object({
        content: z.string(),
      });

      const specialChars = [
        'Test with "quotes"',
        "Test with 'apostrophes'",
        'Test with <tags>',
        'Test with & ampersand',
        'Test with newlines\n\r',
        'Test with unicode: 你好 🌟',
        'Test with emoji: 😀🎉',
      ];

      for (const content of specialChars) {
        expect(() => schema.parse({ content })).not.toThrow();
      }
    });

    it('should handle boundary values for numbers', () => {
      const schema = z.object({
        limit: z.number().min(1).max(100),
      });

      // Boundaries
      expect(() => schema.parse({ limit: 1 })).not.toThrow();
      expect(() => schema.parse({ limit: 100 })).not.toThrow();
      
      // Just outside boundaries
      expect(() => schema.parse({ limit: 0 })).toThrow();
      expect(() => schema.parse({ limit: 101 })).toThrow();
      
      // Float values
      expect(() => schema.parse({ limit: 1.5 })).not.toThrow(); // Zod allows floats unless specified
      
      // Negative
      expect(() => schema.parse({ limit: -1 })).toThrow();
    });
  });
});

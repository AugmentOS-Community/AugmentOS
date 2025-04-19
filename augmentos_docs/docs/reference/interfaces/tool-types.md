---
sidebar_position: 5
title: Tool Types
---

# Tool Types

This page documents the interfaces and types used for TPA tools integration with Mira AI.

For a complete guide on implementing TPA tools, see [AI Tools](/tools).

## ToolSchema

Interface defining the structure of a tool that a TPA can expose to Mira AI.

```typescript
interface ToolSchema {
  /** Unique identifier for the tool */
  id: string;
  
  /** Human-readable description of what the tool does */
  description: string;
  
  /** Optional phrases that might trigger this tool (helps Mira recognize when to use it) */
  activationPhrases?: string[];
  
  /** Definition of parameters this tool accepts */
  parameters?: Record<string, ToolParameterSchema>;
}
```

## ToolParameterSchema

Interface defining the structure of parameters that a tool accepts.

```typescript
interface ToolParameterSchema {
  /** Data type of the parameter */
  type: 'string' | 'number' | 'boolean';
  
  /** Human-readable description of what the parameter is for */
  description: string;
  
  /** Optional list of allowed values for string parameters */
  enum?: string[];
  
  /** Whether this parameter is required */
  required?: boolean;
}
```

## ToolCall

Interface representing a call to a TPA tool from Mira AI.

```typescript
interface ToolCall {
  /** ID of the tool being called */
  toolId: string;
  
  /** Parameter values for this specific call */
  toolParameters: Record<string, string | number | boolean>;
  
  /** When the tool call was made */
  timestamp: Date;
  
  /** ID of the user who triggered the tool call */
  userId: string;
}
```

## Tool Configuration

TPAs define their tools in a `tpa_config.json` file at the root of their server's public directory. Example:

```json
{
  "name": "Todo App",
  "description": "Manage your to-do items",
  "version": "1.0.0",
  "tools": [
    {
      "id": "add_todo",
      "description": "Add a new to-do item",
      "activationPhrases": ["add a reminder", "create a todo", "remind me to"],
      "parameters": {
        "todo_item": {
          "type": "string",
          "description": "The to-do item text",
          "required": true
        },
        "due_date": {
          "type": "string",
          "description": "Due date in ISO format (YYYY-MM-DD)"
        }
      }
    },
    {
      "id": "get_todos",
      "description": "Get all to-do items",
      "activationPhrases": ["show my todos", "list my reminders"],
      "parameters": {
        "include_completed": {
          "type": "boolean",
          "description": "Whether to include completed items",
          "required": false
        }
      }
    }
  ]
}
``` 
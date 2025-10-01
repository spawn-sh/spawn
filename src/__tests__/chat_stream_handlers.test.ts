import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  getSpawnWriteTags,
  getSpawnRenameTags,
  getSpawnAddDependencyTags,
  getSpawnDeleteTags,
} from "../ipc/utils/spawn_tag_parser";

import { processFullResponseActions } from "../ipc/processors/response_processor";
import {
  removeSpawnTags,
  hasUnclosedSpawnWrite,
} from "../ipc/handlers/chat_stream_handlers";
import fs from "node:fs";
import git from "isomorphic-git";
import { db } from "../db";
import { cleanFullResponse } from "@/ipc/utils/cleanFullResponse";

// Mock fs with default export
vi.mock("node:fs", async () => {
  return {
    default: {
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      existsSync: vi.fn().mockReturnValue(false), // Default to false to avoid creating temp directory
      renameSync: vi.fn(),
      unlinkSync: vi.fn(),
      lstatSync: vi.fn().mockReturnValue({ isDirectory: () => false }),
      promises: {
        readFile: vi.fn().mockResolvedValue(""),
      },
    },
    existsSync: vi.fn().mockReturnValue(false), // Also mock the named export
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    renameSync: vi.fn(),
    unlinkSync: vi.fn(),
    lstatSync: vi.fn().mockReturnValue({ isDirectory: () => false }),
    promises: {
      readFile: vi.fn().mockResolvedValue(""),
    },
  };
});

// Mock isomorphic-git
vi.mock("isomorphic-git", () => ({
  default: {
    add: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    statusMatrix: vi.fn().mockResolvedValue([]),
  },
}));

// Mock paths module to control getSpawnAppPath
vi.mock("../paths/paths", () => ({
  getSpawnAppPath: vi.fn().mockImplementation((appPath) => {
    return `/mock/user/data/path/${appPath}`;
  }),
  getUserDataPath: vi.fn().mockReturnValue("/mock/user/data/path"),
}));

// Mock db
vi.mock("../db", () => ({
  db: {
    query: {
      chats: {
        findFirst: vi.fn(),
      },
      messages: {
        findFirst: vi.fn(),
      },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  },
}));

describe("getSpawnAddDependencyTags", () => {
  it("should return an empty array when no spawn-add-dependency tags are found", () => {
    const result = getSpawnAddDependencyTags("No spawn-add-dependency tags here");
    expect(result).toEqual([]);
  });

  it("should return an array of spawn-add-dependency tags", () => {
    const result = getSpawnAddDependencyTags(
      `<spawn-add-dependency packages="uuid"></spawn-add-dependency>`,
    );
    expect(result).toEqual(["uuid"]);
  });

  it("should return all the packages in the spawn-add-dependency tags", () => {
    const result = getSpawnAddDependencyTags(
      `<spawn-add-dependency packages="pkg1 pkg2"></spawn-add-dependency>`,
    );
    expect(result).toEqual(["pkg1", "pkg2"]);
  });

  it("should return all the packages in the spawn-add-dependency tags", () => {
    const result = getSpawnAddDependencyTags(
      `txt before<spawn-add-dependency packages="pkg1 pkg2"></spawn-add-dependency>text after`,
    );
    expect(result).toEqual(["pkg1", "pkg2"]);
  });

  it("should return all the packages in multiple spawn-add-dependency tags", () => {
    const result = getSpawnAddDependencyTags(
      `txt before<spawn-add-dependency packages="pkg1 pkg2"></spawn-add-dependency>txt between<spawn-add-dependency packages="pkg3"></spawn-add-dependency>text after`,
    );
    expect(result).toEqual(["pkg1", "pkg2", "pkg3"]);
  });
});
describe("getSpawnWriteTags", () => {
  it("should return an empty array when no spawn-write tags are found", () => {
    const result = getSpawnWriteTags("No spawn-write tags here");
    expect(result).toEqual([]);
  });

  it("should return a spawn-write tag", () => {
    const result =
      getSpawnWriteTags(`<spawn-write path="src/components/TodoItem.tsx" description="Creating a component for individual todo items">
import React from "react";
console.log("TodoItem");
</spawn-write>`);
    expect(result).toEqual([
      {
        path: "src/components/TodoItem.tsx",
        description: "Creating a component for individual todo items",
        content: `import React from "react";
console.log("TodoItem");`,
      },
    ]);
  });

  it("should strip out code fence (if needed) from a spawn-write tag", () => {
    const result =
      getSpawnWriteTags(`<spawn-write path="src/components/TodoItem.tsx" description="Creating a component for individual todo items">
\`\`\`tsx
import React from "react";
console.log("TodoItem");
\`\`\`
</spawn-write>
`);
    expect(result).toEqual([
      {
        path: "src/components/TodoItem.tsx",
        description: "Creating a component for individual todo items",
        content: `import React from "react";
console.log("TodoItem");`,
      },
    ]);
  });

  it("should handle missing description", () => {
    const result = getSpawnWriteTags(`
      <spawn-write path="src/pages/locations/neighborhoods/louisville/Highlands.tsx">
import React from 'react';
</spawn-write>
    `);
    expect(result).toEqual([
      {
        path: "src/pages/locations/neighborhoods/louisville/Highlands.tsx",
        description: undefined,
        content: `import React from 'react';`,
      },
    ]);
  });

  it("should handle extra space", () => {
    const result = getSpawnWriteTags(
      cleanFullResponse(`
      <spawn-write path="src/pages/locations/neighborhoods/louisville/Highlands.tsx" description="Updating Highlands neighborhood page to use <a> tags." >
import React from 'react';
</spawn-write>
    `),
    );
    expect(result).toEqual([
      {
        path: "src/pages/locations/neighborhoods/louisville/Highlands.tsx",
        description: "Updating Highlands neighborhood page to use ＜a＞ tags.",
        content: `import React from 'react';`,
      },
    ]);
  });

  it("should handle nested tags", () => {
    const result = getSpawnWriteTags(
      cleanFullResponse(`
      BEFORE TAG
  <spawn-write path="src/pages/locations/neighborhoods/louisville/Highlands.tsx" description="Updating Highlands neighborhood page to use <a> tags.">
import React from 'react';
</spawn-write>
AFTER TAG
    `),
    );
    expect(result).toEqual([
      {
        path: "src/pages/locations/neighborhoods/louisville/Highlands.tsx",
        description: "Updating Highlands neighborhood page to use ＜a＞ tags.",
        content: `import React from 'react';`,
      },
    ]);
  });

  it("should handle nested tags after preprocessing", () => {
    // Simulate the preprocessing step that cleanFullResponse would do
    const inputWithNestedTags = `
      BEFORE TAG
  <spawn-write path="src/pages/locations/neighborhoods/louisville/Highlands.tsx" description="Updating Highlands neighborhood page to use <a> tags.">
import React from 'react';
</spawn-write>
AFTER TAG
    `;

    const cleanedInput = cleanFullResponse(inputWithNestedTags);

    const result = getSpawnWriteTags(cleanedInput);
    expect(result).toEqual([
      {
        path: "src/pages/locations/neighborhoods/louisville/Highlands.tsx",
        description: "Updating Highlands neighborhood page to use ＜a＞ tags.",
        content: `import React from 'react';`,
      },
    ]);
  });

  it("should handle multiple nested tags after preprocessing", () => {
    const inputWithMultipleNestedTags = `<spawn-write path="src/file.tsx" description="Testing <div> and <span> and <a> tags.">content</spawn-write>`;

    // This simulates what cleanFullResponse should do
    const cleanedInput = cleanFullResponse(inputWithMultipleNestedTags);
    const result = getSpawnWriteTags(cleanedInput);
    expect(result).toEqual([
      {
        path: "src/file.tsx",
        description: "Testing ＜div＞ and ＜span＞ and ＜a＞ tags.",
        content: `content`,
      },
    ]);
  });

  it("should handle nested tags in multiple attributes", () => {
    const inputWithNestedInMultipleAttrs = `<spawn-write path="src/<component>.tsx" description="Testing <div> tags.">content</spawn-write>`;

    // This simulates what cleanFullResponse should do
    const cleanedInput = cleanFullResponse(inputWithNestedInMultipleAttrs);

    const result = getSpawnWriteTags(cleanedInput);
    expect(result).toEqual([
      {
        path: "src/＜component＞.tsx",
        description: "Testing ＜div＞ tags.",
        content: `content`,
      },
    ]);
  });

  it("should return an array of spawn-write tags", () => {
    const result = getSpawnWriteTags(
      `I'll create a simple todo list app using React, TypeScript, and shadcn/ui components. Let's get started!

First, I'll create the necessary files for our todo list application:

<spawn-write path="src/types/todo.ts" description="Creating types for our todo items">
export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: Date;
}
</spawn-write>

<spawn-write path="src/components/TodoItem.tsx" description="Creating a component for individual todo items">
import React from "react";
import { Trash2, Check, X } from "lucide-react";
import { Todo } from "../types/todo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TodoItemProps {
  todo: Todo;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

const TodoItem: React.FC<TodoItemProps> = ({ todo, onToggle, onDelete }) => {
  return (
    <div className="flex items-center justify-between p-4 border rounded-lg mb-2 bg-white shadow-sm">
      <div className="flex items-center gap-3 flex-1">
        <Button
          variant="outline"
          size="icon"
          className={cn(
            "h-6 w-6 rounded-full",
            todo.completed && "bg-green-100 text-green-600"
          )}
          onClick={() => onToggle(todo.id)}
        >
          {todo.completed ? (
            <Check className="h-4 w-4" />
          ) : (
            <X className="h-4 w-4 opacity-0" />
          )}
        </Button>
        <span
          className={cn(
            "text-sm",
            todo.completed && "line-through text-gray-500"
          )}
        >
          {todo.text}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
        onClick={() => onDelete(todo.id)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default TodoItem;
</spawn-write>

<spawn-write path="src/components/TodoForm.tsx" description="Creating a form component for adding new todos">
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlusCircle } from "lucide-react";

interface TodoFormProps {
  onAddTodo: (text: string) => void;
}

const TodoForm: React.FC<TodoFormProps> = ({ onAddTodo }) => {
  const [text, setText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      onAddTodo(text.trim());
      setText("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
      <Input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a new task..."
        className="flex-1"
      />
      <Button type="submit" disabled={!text.trim()}>
        <PlusCircle className="h-4 w-4 mr-2" />
        Add
      </Button>
    </form>
  );
};

export default TodoForm;
</spawn-write>

<spawn-write path="src/components/TodoList.tsx" description="Creating the main todo list component">
import React from "react";
import { Todo } from "../types/todo";
import TodoItem from "./TodoItem";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TodoListProps {
  todos: Todo[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

const TodoList: React.FC<TodoListProps> = ({ todos, onToggle, onDelete }) => {
  if (todos.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No tasks yet. Add one above!
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px] rounded-md border p-4">
      <div className="space-y-2">
        {todos.map((todo) => (
          <TodoItem
            key={todo.id}
            todo={todo}
            onToggle={onToggle}
            onDelete={onDelete}
          />
        ))}
      </div>
    </ScrollArea>
  );
};

export default TodoList;
</spawn-write>

<spawn-write path="src/components/TodoStats.tsx" description="Creating a component to show todo statistics">
import React from "react";
import { Todo } from "../types/todo";
import { Card, CardContent } from "@/components/ui/card";

interface TodoStatsProps {
  todos: Todo[];
}

const TodoStats: React.FC<TodoStatsProps> = ({ todos }) => {
  const total = todos.length;
  const completed = todos.filter((todo) => todo.completed).length;
  const pending = total - completed;
  const percentComplete = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <p className="text-sm font-medium text-gray-500">Total Tasks</p>
            <p className="text-3xl font-bold">{total}</p>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <p className="text-sm font-medium text-gray-500">Completed</p>
            <p className="text-3xl font-bold text-green-600">{completed}</p>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <p className="text-sm font-medium text-gray-500">Pending</p>
            <p className="text-3xl font-bold text-amber-600">{pending}</p>
          </div>
        </CardContent>
      </Card>
      
      <Card className="md:col-span-3">
        <CardContent className="pt-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span>{percentComplete}%</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-green-500 transition-all duration-300"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TodoStats;
</spawn-write>

<spawn-write path="src/pages/Index.tsx" description="Creating the main page for our todo app">
import React, { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { Todo } from "../types/todo";
import TodoForm from "../components/TodoForm";
import TodoList from "../components/TodoList";
import TodoStats from "../components/TodoStats";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/components/ui/use-toast";

const Index: React.FC = () => {
  const [todos, setTodos] = useState<Todo[]>(() => {
    const savedTodos = localStorage.getItem("todos");
    if (savedTodos) {
      try {
        // Parse the saved todos and convert string dates back to Date objects
        return JSON.parse(savedTodos).map((todo: any) => ({
          ...todo,
          createdAt: new Date(todo.createdAt)
        }));
      } catch (e) {
        console.error("Failed to parse saved todos", e);
        return [];
      }
    }
    return [];
  });

  const { toast } = useToast();

  // Save todos to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("todos", JSON.stringify(todos));
  }, [todos]);

  const handleAddTodo = (text: string) => {
    const newTodo: Todo = {
      id: uuidv4(),
      text,
      completed: false,
      createdAt: new Date()
    };
    
    setTodos([...todos, newTodo]);
    toast({
      title: "Task added",
      description: "Your new task has been added successfully.",
    });
  };

  const handleToggleTodo = (id: string) => {
    setTodos(
      todos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      )
    );
    
    const todo = todos.find(t => t.id === id);
    if (todo) {
      toast({
        title: todo.completed ? "Task marked as incomplete" : "Task completed",
        description: todo.text,
      });
    }
  };

  const handleDeleteTodo = (id: string) => {
    const todoToDelete = todos.find(todo => todo.id === id);
    setTodos(todos.filter((todo) => todo.id !== id));
    
    if (todoToDelete) {
      toast({
        title: "Task deleted",
        description: todoToDelete.text,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2 text-center">Todo List</h1>
      <p className="text-gray-500 mb-8 text-center">
        Keep track of your tasks and stay organized
      </p>
      
      <TodoStats todos={todos} />
      <TodoForm onAddTodo={handleAddTodo} />
      <TodoList
        todos={todos}
        onToggle={handleToggleTodo}
        onDelete={handleDeleteTodo}
      />
      <Toaster />
    </div>
  );
};

export default Index;
</spawn-write>

<spawn-add-dependency packages="uuid"></spawn-add-dependency>

<spawn-write path="src/types/uuid.d.ts" description="Adding type definitions for uuid">
declare module 'uuid' {
  export function v4(): string;
}
</spawn-write>

I've created a complete todo list application with the ability to add, complete, and delete tasks. The app includes statistics and uses local storage to persist data.`,
    );
    expect(result.length).toEqual(7);
  });
});

describe("getSpawnRenameTags", () => {
  it("should return an empty array when no spawn-rename tags are found", () => {
    const result = getSpawnRenameTags("No spawn-rename tags here");
    expect(result).toEqual([]);
  });

  it("should return an array of spawn-rename tags", () => {
    const result = getSpawnRenameTags(
      `<spawn-rename from="src/components/UserProfile.jsx" to="src/components/ProfileCard.jsx"></spawn-rename>
      <spawn-rename from="src/utils/helpers.js" to="src/utils/utils.js"></spawn-rename>`,
    );
    expect(result).toEqual([
      {
        from: "src/components/UserProfile.jsx",
        to: "src/components/ProfileCard.jsx",
      },
      { from: "src/utils/helpers.js", to: "src/utils/utils.js" },
    ]);
  });
});

describe("getSpawnDeleteTags", () => {
  it("should return an empty array when no spawn-delete tags are found", () => {
    const result = getSpawnDeleteTags("No spawn-delete tags here");
    expect(result).toEqual([]);
  });

  it("should return an array of spawn-delete paths", () => {
    const result = getSpawnDeleteTags(
      `<spawn-delete path="src/components/Analytics.jsx"></spawn-delete>
      <spawn-delete path="src/utils/unused.js"></spawn-delete>`,
    );
    expect(result).toEqual([
      "src/components/Analytics.jsx",
      "src/utils/unused.js",
    ]);
  });
});

describe("processFullResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock db query response
    vi.mocked(db.query.chats.findFirst).mockResolvedValue({
      id: 1,
      appId: 1,
      title: "Test Chat",
      createdAt: new Date(),
      app: {
        id: 1,
        name: "Mock App",
        path: "mock-app-path",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      messages: [],
    } as any);

    vi.mocked(db.query.messages.findFirst).mockResolvedValue({
      id: 1,
      chatId: 1,
      role: "assistant",
      content: "some content",
      createdAt: new Date(),
      approvalState: null,
      commitHash: null,
    } as any);

    // Default mock for existsSync to return true
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  it("should return empty object when no spawn-write tags are found", async () => {
    const result = await processFullResponseActions(
      "No spawn-write tags here",
      1,
      {
        chatSummary: undefined,
        messageId: 1,
      },
    );
    expect(result).toEqual({
      updatedFiles: false,
      extraFiles: undefined,
      extraFilesError: undefined,
    });
    expect(fs.mkdirSync).not.toHaveBeenCalled();
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it("should process spawn-write tags and create files", async () => {
    // Set up fs mocks to succeed
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

    const response = `<spawn-write path="src/file1.js">console.log('Hello');</spawn-write>`;

    const result = await processFullResponseActions(response, 1, {
      chatSummary: undefined,
      messageId: 1,
    });

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      "/mock/user/data/path/mock-app-path/src",
      { recursive: true },
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      "/mock/user/data/path/mock-app-path/src/file1.js",
      "console.log('Hello');",
    );
    expect(git.add).toHaveBeenCalledWith(
      expect.objectContaining({
        filepath: "src/file1.js",
      }),
    );
    expect(git.commit).toHaveBeenCalled();
    expect(result).toEqual({ updatedFiles: true });
  });

  it("should handle file system errors gracefully", async () => {
    // Set up the mock to throw an error on mkdirSync
    vi.mocked(fs.mkdirSync).mockImplementationOnce(() => {
      throw new Error("Mock filesystem error");
    });

    const response = `<spawn-write path="src/error-file.js">This will fail</spawn-write>`;

    const result = await processFullResponseActions(response, 1, {
      chatSummary: undefined,
      messageId: 1,
    });

    expect(result).toHaveProperty("error");
    expect(result.error).toContain("Mock filesystem error");
  });

  it("should process multiple spawn-write tags and commit all files", async () => {
    // Clear previous mock calls
    vi.clearAllMocks();

    // Set up fs mocks to succeed
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

    const response = `
    <spawn-write path="src/file1.js">console.log('First file');</spawn-write>
    <spawn-write path="src/utils/file2.js">export const add = (a, b) => a + b;</spawn-write>
    <spawn-write path="src/components/Button.tsx">
    import React from 'react';
    export const Button = ({ children }) => <button>{children}</button>;
    </spawn-write>
    `;

    const result = await processFullResponseActions(response, 1, {
      chatSummary: undefined,
      messageId: 1,
    });

    // Check that directories were created for each file path
    expect(fs.mkdirSync).toHaveBeenCalledWith(
      "/mock/user/data/path/mock-app-path/src",
      { recursive: true },
    );
    expect(fs.mkdirSync).toHaveBeenCalledWith(
      "/mock/user/data/path/mock-app-path/src/utils",
      { recursive: true },
    );
    expect(fs.mkdirSync).toHaveBeenCalledWith(
      "/mock/user/data/path/mock-app-path/src/components",
      { recursive: true },
    );

    // Using toHaveBeenNthCalledWith to check each specific call
    expect(fs.writeFileSync).toHaveBeenNthCalledWith(
      1,
      "/mock/user/data/path/mock-app-path/src/file1.js",
      "console.log('First file');",
    );
    expect(fs.writeFileSync).toHaveBeenNthCalledWith(
      2,
      "/mock/user/data/path/mock-app-path/src/utils/file2.js",
      "export const add = (a, b) => a + b;",
    );
    expect(fs.writeFileSync).toHaveBeenNthCalledWith(
      3,
      "/mock/user/data/path/mock-app-path/src/components/Button.tsx",
      "import React from 'react';\n    export const Button = ({ children }) => <button>{children}</button>;",
    );

    // Verify git operations were called for each file
    expect(git.add).toHaveBeenCalledWith(
      expect.objectContaining({
        filepath: "src/file1.js",
      }),
    );
    expect(git.add).toHaveBeenCalledWith(
      expect.objectContaining({
        filepath: "src/utils/file2.js",
      }),
    );
    expect(git.add).toHaveBeenCalledWith(
      expect.objectContaining({
        filepath: "src/components/Button.tsx",
      }),
    );

    // Verify commit was called once after all files were added
    expect(git.commit).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ updatedFiles: true });
  });

  it("should process spawn-rename tags and rename files", async () => {
    // Set up fs mocks to succeed
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.renameSync).mockImplementation(() => undefined);

    const response = `<spawn-rename from="src/components/OldComponent.jsx" to="src/components/NewComponent.jsx"></spawn-rename>`;

    const result = await processFullResponseActions(response, 1, {
      chatSummary: undefined,
      messageId: 1,
    });

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      "/mock/user/data/path/mock-app-path/src/components",
      { recursive: true },
    );
    expect(fs.renameSync).toHaveBeenCalledWith(
      "/mock/user/data/path/mock-app-path/src/components/OldComponent.jsx",
      "/mock/user/data/path/mock-app-path/src/components/NewComponent.jsx",
    );
    expect(git.add).toHaveBeenCalledWith(
      expect.objectContaining({
        filepath: "src/components/NewComponent.jsx",
      }),
    );
    expect(git.remove).toHaveBeenCalledWith(
      expect.objectContaining({
        filepath: "src/components/OldComponent.jsx",
      }),
    );
    expect(git.commit).toHaveBeenCalled();
    expect(result).toEqual({ updatedFiles: true });
  });

  it("should handle non-existent files during rename gracefully", async () => {
    // Set up the mock to return false for existsSync
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const response = `<spawn-rename from="src/components/NonExistent.jsx" to="src/components/NewFile.jsx"></spawn-rename>`;

    const result = await processFullResponseActions(response, 1, {
      chatSummary: undefined,
      messageId: 1,
    });

    expect(fs.mkdirSync).toHaveBeenCalled();
    expect(fs.renameSync).not.toHaveBeenCalled();
    expect(git.commit).not.toHaveBeenCalled();
    expect(result).toEqual({
      updatedFiles: false,
      extraFiles: undefined,
      extraFilesError: undefined,
    });
  });

  it("should process spawn-delete tags and delete files", async () => {
    // Set up fs mocks to succeed
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.unlinkSync).mockImplementation(() => undefined);

    const response = `<spawn-delete path="src/components/Unused.jsx"></spawn-delete>`;

    const result = await processFullResponseActions(response, 1, {
      chatSummary: undefined,
      messageId: 1,
    });

    expect(fs.unlinkSync).toHaveBeenCalledWith(
      "/mock/user/data/path/mock-app-path/src/components/Unused.jsx",
    );
    expect(git.remove).toHaveBeenCalledWith(
      expect.objectContaining({
        filepath: "src/components/Unused.jsx",
      }),
    );
    expect(git.commit).toHaveBeenCalled();
    expect(result).toEqual({ updatedFiles: true });
  });

  it("should handle non-existent files during delete gracefully", async () => {
    // Set up the mock to return false for existsSync
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const response = `<spawn-delete path="src/components/NonExistent.jsx"></spawn-delete>`;

    const result = await processFullResponseActions(response, 1, {
      chatSummary: undefined,
      messageId: 1,
    });

    expect(fs.unlinkSync).not.toHaveBeenCalled();
    expect(git.remove).not.toHaveBeenCalled();
    expect(git.commit).not.toHaveBeenCalled();
    expect(result).toEqual({
      updatedFiles: false,
      extraFiles: undefined,
      extraFilesError: undefined,
    });
  });

  it("should process mixed operations (write, rename, delete) in one response", async () => {
    // Set up fs mocks to succeed
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
    vi.mocked(fs.renameSync).mockImplementation(() => undefined);
    vi.mocked(fs.unlinkSync).mockImplementation(() => undefined);

    const response = `
    <spawn-write path="src/components/NewComponent.jsx">import React from 'react'; export default () => <div>New</div>;</spawn-write>
    <spawn-rename from="src/components/OldComponent.jsx" to="src/components/RenamedComponent.jsx"></spawn-rename>
    <spawn-delete path="src/components/Unused.jsx"></spawn-delete>
    `;

    const result = await processFullResponseActions(response, 1, {
      chatSummary: undefined,
      messageId: 1,
    });

    // Check write operation happened
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      "/mock/user/data/path/mock-app-path/src/components/NewComponent.jsx",
      "import React from 'react'; export default () => <div>New</div>;",
    );

    // Check rename operation happened
    expect(fs.renameSync).toHaveBeenCalledWith(
      "/mock/user/data/path/mock-app-path/src/components/OldComponent.jsx",
      "/mock/user/data/path/mock-app-path/src/components/RenamedComponent.jsx",
    );

    // Check delete operation happened
    expect(fs.unlinkSync).toHaveBeenCalledWith(
      "/mock/user/data/path/mock-app-path/src/components/Unused.jsx",
    );

    // Check git operations
    expect(git.add).toHaveBeenCalledTimes(2); // For the write and rename
    expect(git.remove).toHaveBeenCalledTimes(2); // For the rename and delete

    // Check the commit message includes all operations
    expect(git.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(
          "wrote 1 file(s), renamed 1 file(s), deleted 1 file(s)",
        ),
      }),
    );

    expect(result).toEqual({ updatedFiles: true });
  });
});

describe("removeSpawnTags", () => {
  it("should return empty string when input is empty", () => {
    const result = removeSpawnTags("");
    expect(result).toBe("");
  });

  it("should return the same text when no spawn tags are present", () => {
    const text = "This is a regular text without any spawn tags.";
    const result = removeSpawnTags(text);
    expect(result).toBe(text);
  });

  it("should remove a single spawn-write tag", () => {
    const text = `Before text <spawn-write path="src/file.js">console.log('hello');</spawn-write> After text`;
    const result = removeSpawnTags(text);
    expect(result).toBe("Before text  After text");
  });

  it("should remove a single spawn-delete tag", () => {
    const text = `Before text <spawn-delete path="src/file.js"></spawn-delete> After text`;
    const result = removeSpawnTags(text);
    expect(result).toBe("Before text  After text");
  });

  it("should remove a single spawn-rename tag", () => {
    const text = `Before text <spawn-rename from="old.js" to="new.js"></spawn-rename> After text`;
    const result = removeSpawnTags(text);
    expect(result).toBe("Before text  After text");
  });

  it("should remove multiple different spawn tags", () => {
    const text = `Start <spawn-write path="file1.js">code here</spawn-write> middle <spawn-delete path="file2.js"></spawn-delete> end <spawn-rename from="old.js" to="new.js"></spawn-rename> finish`;
    const result = removeSpawnTags(text);
    expect(result).toBe("Start  middle  end  finish");
  });

  it("should remove spawn tags with multiline content", () => {
    const text = `Before
<spawn-write path="src/component.tsx" description="A React component">
import React from 'react';

const Component = () => {
  return <div>Hello World</div>;
};

export default Component;
</spawn-write>
After`;
    const result = removeSpawnTags(text);
    expect(result).toBe("Before\n\nAfter");
  });

  it("should handle spawn tags with complex attributes", () => {
    const text = `Text <spawn-write path="src/file.js" description="Complex component with quotes" version="1.0">const x = "hello world";</spawn-write> more text`;
    const result = removeSpawnTags(text);
    expect(result).toBe("Text  more text");
  });

  it("should remove spawn tags and trim whitespace", () => {
    const text = `  <spawn-write path="file.js">code</spawn-write>  `;
    const result = removeSpawnTags(text);
    expect(result).toBe("");
  });

  it("should handle nested content that looks like tags", () => {
    const text = `<spawn-write path="file.js">
const html = '<div>Hello</div>';
const component = <Component />;
</spawn-write>`;
    const result = removeSpawnTags(text);
    expect(result).toBe("");
  });

  it("should handle self-closing spawn tags", () => {
    const text = `Before <spawn-delete path="file.js" /> After`;
    const result = removeSpawnTags(text);
    expect(result).toBe('Before <spawn-delete path="file.js" /> After');
  });

  it("should handle malformed spawn tags gracefully", () => {
    const text = `Before <spawn-write path="file.js">unclosed tag After`;
    const result = removeSpawnTags(text);
    expect(result).toBe('Before <spawn-write path="file.js">unclosed tag After');
  });

  it("should handle spawn tags with special characters in content", () => {
    const text = `<spawn-write path="file.js">
const regex = /<div[^>]*>.*?</div>/g;
const special = "Special chars: @#$%^&*()[]{}|\\";
</spawn-write>`;
    const result = removeSpawnTags(text);
    expect(result).toBe("");
  });

  it("should handle multiple spawn tags of the same type", () => {
    const text = `<spawn-write path="file1.js">code1</spawn-write> between <spawn-write path="file2.js">code2</spawn-write>`;
    const result = removeSpawnTags(text);
    expect(result).toBe("between");
  });

  it("should handle spawn tags with custom tag names", () => {
    const text = `Before <spawn-custom-action param="value">content</spawn-custom-action> After`;
    const result = removeSpawnTags(text);
    expect(result).toBe("Before  After");
  });
});

describe("hasUnclosedSpawnWrite", () => {
  it("should return false when there are no spawn-write tags", () => {
    const text = "This is just regular text without any spawn tags.";
    const result = hasUnclosedSpawnWrite(text);
    expect(result).toBe(false);
  });

  it("should return false when spawn-write tag is properly closed", () => {
    const text = `<spawn-write path="src/file.js">console.log('hello');</spawn-write>`;
    const result = hasUnclosedSpawnWrite(text);
    expect(result).toBe(false);
  });

  it("should return true when spawn-write tag is not closed", () => {
    const text = `<spawn-write path="src/file.js">console.log('hello');`;
    const result = hasUnclosedSpawnWrite(text);
    expect(result).toBe(true);
  });

  it("should return false when spawn-write tag with attributes is properly closed", () => {
    const text = `<spawn-write path="src/file.js" description="A test file">console.log('hello');</spawn-write>`;
    const result = hasUnclosedSpawnWrite(text);
    expect(result).toBe(false);
  });

  it("should return true when spawn-write tag with attributes is not closed", () => {
    const text = `<spawn-write path="src/file.js" description="A test file">console.log('hello');`;
    const result = hasUnclosedSpawnWrite(text);
    expect(result).toBe(true);
  });

  it("should return false when there are multiple closed spawn-write tags", () => {
    const text = `<spawn-write path="src/file1.js">code1</spawn-write>
    Some text in between
    <spawn-write path="src/file2.js">code2</spawn-write>`;
    const result = hasUnclosedSpawnWrite(text);
    expect(result).toBe(false);
  });

  it("should return true when the last spawn-write tag is unclosed", () => {
    const text = `<spawn-write path="src/file1.js">code1</spawn-write>
    Some text in between
    <spawn-write path="src/file2.js">code2`;
    const result = hasUnclosedSpawnWrite(text);
    expect(result).toBe(true);
  });

  it("should return false when first tag is unclosed but last tag is closed", () => {
    const text = `<spawn-write path="src/file1.js">code1
    Some text in between
    <spawn-write path="src/file2.js">code2</spawn-write>`;
    const result = hasUnclosedSpawnWrite(text);
    expect(result).toBe(false);
  });

  it("should handle multiline content correctly", () => {
    const text = `<spawn-write path="src/component.tsx" description="React component">
import React from 'react';

const Component = () => {
  return (
    <div>
      <h1>Hello World</h1>
    </div>
  );
};

export default Component;
</spawn-write>`;
    const result = hasUnclosedSpawnWrite(text);
    expect(result).toBe(false);
  });

  it("should handle multiline unclosed content correctly", () => {
    const text = `<spawn-write path="src/component.tsx" description="React component">
import React from 'react';

const Component = () => {
  return (
    <div>
      <h1>Hello World</h1>
    </div>
  );
};

export default Component;`;
    const result = hasUnclosedSpawnWrite(text);
    expect(result).toBe(true);
  });

  it("should handle complex attributes correctly", () => {
    const text = `<spawn-write path="src/file.js" description="File with quotes and special chars" version="1.0" author="test">
const message = "Hello 'world'";
const regex = /<div[^>]*>/g;
</spawn-write>`;
    const result = hasUnclosedSpawnWrite(text);
    expect(result).toBe(false);
  });

  it("should handle text before and after spawn-write tags", () => {
    const text = `Some text before the tag
<spawn-write path="src/file.js">console.log('hello');</spawn-write>
Some text after the tag`;
    const result = hasUnclosedSpawnWrite(text);
    expect(result).toBe(false);
  });

  it("should handle unclosed tag with text after", () => {
    const text = `Some text before the tag
<spawn-write path="src/file.js">console.log('hello');
Some text after the unclosed tag`;
    const result = hasUnclosedSpawnWrite(text);
    expect(result).toBe(true);
  });

  it("should handle empty spawn-write tags", () => {
    const text = `<spawn-write path="src/file.js"></spawn-write>`;
    const result = hasUnclosedSpawnWrite(text);
    expect(result).toBe(false);
  });

  it("should handle unclosed empty spawn-write tags", () => {
    const text = `<spawn-write path="src/file.js">`;
    const result = hasUnclosedSpawnWrite(text);
    expect(result).toBe(true);
  });

  it("should focus on the last opening tag when there are mixed states", () => {
    const text = `<spawn-write path="src/file1.js">completed content</spawn-write>
    <spawn-write path="src/file2.js">unclosed content
    <spawn-write path="src/file3.js">final content</spawn-write>`;
    const result = hasUnclosedSpawnWrite(text);
    expect(result).toBe(false);
  });

  it("should handle tags with special characters in attributes", () => {
    const text = `<spawn-write path="src/file-name_with.special@chars.js" description="File with special chars in path">content</spawn-write>`;
    const result = hasUnclosedSpawnWrite(text);
    expect(result).toBe(false);
  });
});

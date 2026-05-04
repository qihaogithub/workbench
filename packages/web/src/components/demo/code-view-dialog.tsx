'use client'

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Copy, Save } from "lucide-react";
import { useToast } from "@/components/ui/toast-provider";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-json";

interface CodeViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: string;
  schema: string;
  pageName: string;
  sessionId: string;
  demoId: string;
  onSave: (type: "code" | "schema", content: string) => Promise<void>;
}

const EDITOR_STYLE: React.CSSProperties = {
  fontFamily: '"Fira code", "Fira Mono", monospace',
  fontSize: 13,
  lineHeight: 1.5,
  minHeight: 400,
  backgroundColor: "#09090b",
  borderRadius: 6,
  padding: 16,
};

function highlightTsx(code: string): string {
  if (!Prism.languages.tsx) return code;
  return Prism.highlight(code, Prism.languages.tsx, "tsx");
}

function highlightJson(code: string): string {
  if (!Prism.languages.json) return code;
  return Prism.highlight(code, Prism.languages.json, "json");
}

export function CodeViewDialog({
  open,
  onOpenChange,
  code,
  schema,
  pageName,
  onSave,
}: CodeViewDialogProps) {
  const [activeCode, setActiveCode] = useState(code);
  const [activeSchema, setActiveSchema] = useState(schema);
  const [activeTab, setActiveTab] = useState<"code" | "schema">("code");
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const syncPropsToState = useCallback(() => {
    setActiveCode(code);
    setActiveSchema(schema);
    setActiveTab("code");
  }, [code, schema]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      syncPropsToState();
    }
    onOpenChange(nextOpen);
  };

  const handleCopyCode = () => {
    const content = activeTab === "code" ? activeCode : activeSchema;
    navigator.clipboard.writeText(content);
    toast({ title: "代码已复制" });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const content = activeTab === "code" ? activeCode : activeSchema;
      await onSave(activeTab, content);
      toast({ title: "保存成功" });
      onOpenChange(false);
    } catch {
      toast({ title: "保存失败", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>查看代码 - {pageName}</DialogTitle>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "code" | "schema")}
          className="flex-1 flex flex-col min-h-0"
        >
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="code">index.tsx</TabsTrigger>
              <TabsTrigger value="schema">config.schema.json</TabsTrigger>
            </TabsList>
            <Button variant="ghost" size="sm" onClick={handleCopyCode}>
              <Copy className="h-4 w-4 mr-1" />
              复制
            </Button>
          </div>

          <TabsContent
            value="code"
            className="flex-1 overflow-auto mt-2 data-[state=inactive]:hidden"
          >
            <Editor
              value={activeCode}
              onValueChange={setActiveCode}
              highlight={highlightTsx}
              padding={16}
              style={EDITOR_STYLE}
              textareaClassName="code-editor-textarea"
            />
          </TabsContent>

          <TabsContent
            value="schema"
            className="flex-1 overflow-auto mt-2 data-[state=inactive]:hidden"
          >
            <Editor
              value={activeSchema}
              onValueChange={setActiveSchema}
              highlight={highlightJson}
              padding={16}
              style={EDITOR_STYLE}
              textareaClassName="code-editor-textarea"
            />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="h-4 w-4 mr-1" />
            {isSaving ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

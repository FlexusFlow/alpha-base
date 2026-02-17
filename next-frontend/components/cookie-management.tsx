"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { UserCookie } from "@/lib/types/cookies";

function getExpiryBadge(earliestExpiry: string | null) {
  if (!earliestExpiry) {
    return <Badge variant="secondary">Unknown</Badge>;
  }
  const expiryDate = new Date(earliestExpiry);
  if (expiryDate > new Date()) {
    return <Badge className="bg-green-600 hover:bg-green-600/80 text-white border-transparent">Active</Badge>;
  }
  return <Badge variant="destructive">Expired</Badge>;
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function CookieManagement() {
  const [cookies, setCookies] = useState<UserCookie[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  async function fetchCookies() {
    try {
      const res = await fetch("/api/cookies");
      if (!res.ok) throw new Error("Failed to fetch cookies");
      const data = await res.json();
      setCookies(data.cookies);
    } catch {
      toast({ title: "Failed to load cookies", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchCookies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/cookies", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        toast({ title: data.error || "Upload failed", variant: "destructive" });
        return;
      }

      toast({ title: `Cookie uploaded for ${data.cookie.domain}` });
      await fetchCookies();
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setIsUploading(false);
      // Reset file input so the same file can be re-selected
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/cookies?id=${id}`, { method: "DELETE" });

      if (!res.ok) {
        const data = await res.json();
        toast({ title: data.error || "Delete failed", variant: "destructive" });
        return;
      }

      setCookies((prev) => prev.filter((c) => c.id !== id));
      toast({ title: "Cookie deleted" });
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Upload section */}
      <div className="flex items-center gap-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleUpload}
          className="hidden"
        />
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          {isUploading ? "Uploading..." : "Upload Cookie File"}
        </Button>
        <p className="text-sm text-muted-foreground">
          Accepted format: <code>{"{domain}"}.cookies.json</code>
        </p>
      </div>

      {/* Cookies table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : cookies.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No cookies uploaded yet. Upload a cookie file to get started.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Domain</TableHead>
              <TableHead>Filename</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cookies.map((cookie) => (
              <TableRow key={cookie.id}>
                <TableCell className="font-medium">{cookie.domain}</TableCell>
                <TableCell>{cookie.filename}</TableCell>
                <TableCell>{formatDate(cookie.created_at)}</TableCell>
                <TableCell>{getExpiryBadge(cookie.earliest_expiry)}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(cookie.id)}
                    disabled={deletingId === cookie.id}
                  >
                    {deletingId === cookie.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { SamplePair } from "@/lib/types/deep-memory"

interface SamplePairsTableProps {
  pairs: SamplePair[];
}

export function SamplePairsTable({ pairs }: SamplePairsTableProps) {
  if (pairs.length === 0) {
    return <p className="text-sm text-muted-foreground">No sample pairs available.</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[40%]">Question</TableHead>
          <TableHead className="w-[50%]">Chunk Preview</TableHead>
          <TableHead className="w-[10%] text-right">Score</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pairs.map((pair, i) => (
          <TableRow key={i}>
            <TableCell className="text-sm">{pair.question_text}</TableCell>
            <TableCell className="text-sm text-muted-foreground truncate max-w-[300px]">
              {pair.chunk_preview}
            </TableCell>
            <TableCell className="text-sm text-right">{pair.relevance_score}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

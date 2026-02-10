'use client';

import React, { useEffect, useState, useRef, SetStateAction, ReactElement } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  ColumnDef,
  flexRender,
  SortingState,
  OnChangeFn,
  RowSelectionState,
  PaginationTableState,
  PaginationState,
  PaginationInitialTableState,
} from '@tanstack/react-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { ExternalLink, ChevronUp, ChevronDown } from 'lucide-react';
import { YTVideo } from '@/lib/types/youtube';


interface VideoTableProps {
  loading: ReactElement | null;
  videos: YTVideo[];
  totalCount: number;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onPaginationChange: (pagination: PaginationState) => void;
}


export function VideoTable({ videos, totalCount, selectedIds, onSelectionChange, onPaginationChange, loading}: VideoTableProps) {
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [sorting, setSorting] = useState<SortingState>([]);
  const isInitialMount = useRef(true);

  const [pagination, setPagination] = useState({
    pageIndex: 0, //initial page index
    pageSize: 20, //default page size
  });
  
  useEffect(() => {
    onPaginationChange(pagination)

  }, [pagination.pageIndex, pagination.pageSize])

  // Only sync FROM parent on initial mount or when videos change (not on selectedIds change)
  useEffect(() => {
    const selection: Record<string, boolean> = {};
    videos.forEach((video, index) => {
      if (selectedIds.has(video.video_id)) {
        selection[index.toString()] = true;
      }
    });
    setRowSelection(selection);
  }, [videos]); // Removed selectedIds from dependencies

  // Sync TO parent when user changes selection
  useEffect(() => {
    // Skip on initial mount to avoid triggering parent update
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const selected = new Set<string>();
    Object.keys(rowSelection).forEach((index) => {
      if (rowSelection[index]) {
        const video = videos[parseInt(index)];
        if (video) {
          selected.add(video.video_id);
        }
      }
    });

    // Only call onSelectionChange if selection actually changed
    const hasChanged =
      selected.size !== selectedIds.size ||
      Array.from(selected).some((id) => !selectedIds.has(id));

    if (hasChanged) {
      onSelectionChange(selected);
    }
  }, [rowSelection]); // Removed videos and onSelectionChange from dependencies

  const columns: ColumnDef<YTVideo>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'title',
      header: 'Title',
      cell: ({ row }) => <div className="max-w-[500px] truncate">{row.original.title}</div>,
    },
    {
      accessorKey: 'views',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-8 px-2"
          >
            Views
            {column.getIsSorted() === "asc" ? (
              <ChevronUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ChevronDown className="ml-2 h-4 w-4" />
            ) : null}
          </Button>
        )
      },
      cell: ({ row }) => row.original.views.toLocaleString(),
    },
    {
      accessorKey: 'category',
      header: 'Category',
    },
    {
      id: 'link',
      header: 'Link',
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" asChild>
          <a href={row.original.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      ),
      enableSorting: false,
    },
  ];

  const table = useReactTable({
    data: videos,
    columns,
    getCoreRowModel: getCoreRowModel(),

    // getPaginationRowModel: getPaginationRowModel(), //not needed for server-side pagination
    manualPagination: true, //turn off client-side pagination
    rowCount: totalCount, //pass in the total row count so the table knows how many pages there are (pageCount calculated internally if not provided)
    // pageCount: dataQuery.data?.pageCount, //alternatively directly pass in pageCount instead of rowCount
  
    getSortedRowModel: getSortedRowModel(),
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    state: {
      rowSelection,
      sorting,
      pagination,
    },
    getRowId: (row, index) => index.toString(),

    onPaginationChange: setPagination, //update the pagination state when internal APIs mutate the pagination state
  
    initialState: {
      pagination: {
        pageSize: 20,
      },
    },
  });

  return (
    <div className="space-y-4">
      <div className="relative border rounded-lg">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/5 backdrop-blur-sm  transition-opacity duration-300 rounded-lg">
            {loading}
          </div>
        )}
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No videos found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {table.getFilteredSelectedRowModel().rows.length} of{' '}
          {table.getFilteredRowModel().rows.length} row(s) selected
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            // onClick={() => table.previousPage()}
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <div className="text-sm text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import IconButton from "@mui/material/IconButton";
import { DataGrid, type GridColDef, type GridRowSelectionModel } from "@mui/x-data-grid";

import type { YTVideo } from "../types/youtube";

interface VideoTableProps {
  videos: YTVideo[];
  selectedIds: GridRowSelectionModel;
  onSelectionChange: (ids: GridRowSelectionModel) => void;
}

const columns: GridColDef[] = [
  {
    field: "title",
    headerName: "Title",
    flex: 1,
    minWidth: 300,
  },
  {
    field: "views",
    headerName: "Views",
    width: 120,
    type: "number",
    valueFormatter: (value: number) => value.toLocaleString(),
  },
  {
    field: "category",
    headerName: "Category",
    width: 200,
  },
  {
    field: "url",
    headerName: "Link",
    width: 70,
    sortable: false,
    renderCell: (params) => (
      <IconButton
        size="small"
        href={params.value}
        target="_blank"
        rel="noopener noreferrer"
      >
        <OpenInNewIcon fontSize="small" />
      </IconButton>
    ),
  },
];

export default function VideoTable({
  videos,
  selectedIds,
  onSelectionChange,
}: VideoTableProps) {
  const rows = videos.map((v) => ({
    id: v.video_id,
    ...v,
  }));

  return (
    <div style={{ width: "100%" }}>
      <DataGrid
        rows={rows}
        columns={columns}
        checkboxSelection
        rowSelectionModel={selectedIds}
        onRowSelectionModelChange={onSelectionChange}
        initialState={{
          pagination: { paginationModel: { pageSize: 25 } },
        }}
        pageSizeOptions={[10, 25, 50, 100]}
        disableRowSelectionOnClick
        autoHeight
      />
    </div>
  );
}

import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <Box className="min-h-screen bg-gray-50">
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div">
            ZipTrader Knowledge Base
          </Typography>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" className="py-6">
        {children}
      </Container>
    </Box>
  );
}

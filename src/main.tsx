import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { Record } from "./pages/Record";
import { Table } from "./pages/Table";
import { Summary } from "./pages/Summary";
import { Method } from "./pages/Method";
import { About } from "./pages/About";
import { Entry } from "./pages/Entry";
import { NotFound } from "./pages/NotFound";
import "./styles.css";

// The timeline used to live at /timeline; it is the home page now. Old links keep their ?n= and #section.
function ToHome() {
  const { search, hash } = useLocation();
  return <Navigate to={"/" + search + hash} replace />;
}

const router = createBrowserRouter(
  [
    {
      element: <Layout />,
      children: [
        { path: "/", element: <Home /> },
        { path: "/record", element: <Record /> },
        { path: "/table", element: <Table /> },
        { path: "/timeline", element: <ToHome /> },
        { path: "/summary", element: <Summary /> },
        { path: "/method", element: <Method /> },
        { path: "/about", element: <About /> },
        { path: "/entry/:n", element: <Entry /> },
        { path: "*", element: <NotFound /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, "") },
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

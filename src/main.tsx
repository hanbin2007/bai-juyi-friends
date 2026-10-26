import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { Summary } from "./pages/Summary";
import { Method } from "./pages/Method";
import { About } from "./pages/About";
import { Entry } from "./pages/Entry";
import { Timeline } from "./pages/Timeline";
import { NotFound } from "./pages/NotFound";
import "./styles.css";

const router = createBrowserRouter(
  [
    {
      element: <Layout />,
      children: [
        { path: "/", element: <Home /> },
        { path: "/timeline", element: <Timeline /> },
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

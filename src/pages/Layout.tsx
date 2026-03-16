import { Outlet } from "react-router-dom";
import MenuLateral from "../components/MenuLateral";

export default function Layout() {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <MenuLateral />
      <main style={{ flex: 1, padding: "32px", overflowY: "auto" }}>
        <Outlet />
      </main>
    </div>
  );
}

import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, Camera, Hand, GraduationCap, History, Settings, HelpCircle, LogOut, BookOpen, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Layout,
});

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/recognize", label: "Live", icon: Camera },
  { to: "/asl", label: "ASL live", icon: Hand },
  { to: "/train", label: "Teach signs", icon: GraduationCap },
  { to: "/dictionary", label: "Dictionary", icon: BookOpen },
  { to: "/model-status", label: "Model status", icon: Activity },
  { to: "/history", label: "History", icon: History },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/help", label: "Help", icon: HelpCircle },
] as const;

function Layout() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
  return (
    <div className="min-h-screen md:flex">
      <aside className="sticky top-0 z-20 flex items-center justify-between bg-sidebar px-4 py-3 text-sidebar-foreground md:h-screen md:w-60 md:flex-col md:items-stretch md:justify-start md:px-4 md:py-6">
        <Link to="/dashboard" className="md:mb-8 md:px-2"><Logo light /></Link>
        <nav className="hidden flex-col gap-1 md:flex">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm opacity-80 hover:bg-sidebar-accent hover:opacity-100"
              activeProps={{ className: "bg-sidebar-accent !opacity-100 text-sidebar-primary" }}
            >
              <n.icon className="size-4" /> {n.label}
            </Link>
          ))}
        </nav>
        <button onClick={signOut} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm opacity-70 hover:opacity-100 md:mt-auto">
          <LogOut className="size-4" /> <span className="hidden md:inline">Sign out</span>
        </button>
      </aside>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-6 border-t bg-card md:hidden">
        {nav.map((n) => (
          <Link key={n.to} to={n.to} className="flex flex-col items-center gap-1 py-2 text-[10px] text-muted-foreground" activeProps={{ className: "!text-primary" }}>
            <n.icon className="size-5" />
            {n.label}
          </Link>
        ))}
      </nav>
      <main className="flex-1 px-4 pb-24 pt-6 md:px-10 md:pb-10 md:pt-10">
        <Outlet />
      </main>
    </div>
  );
}

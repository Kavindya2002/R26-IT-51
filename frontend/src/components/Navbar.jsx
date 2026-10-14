import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Menu, X, LogIn, LogOut, LayoutDashboard } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Logo from "./Logo.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const NAV_LINKS = [
  { label: "Home", id: "home" },
  { label: "About", id: "about" },
  { label: "Features", id: "features" },
  { label: "Team", id: "team" },
  { label: "Contact", id: "contact" }
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("home");
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === "/";

  // Highlight the link of the section currently on screen
  useEffect(() => {
    if (!isHome) return;
    function onScroll() {
      let current = "home";
      for (const { id } of NAV_LINKS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 170) current = id;
      }
      // bottom of the page → last link (Contact is short)
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) {
        current = NAV_LINKS[NAV_LINKS.length - 1].id;
      }
      setActive(current);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHome]);

  function goTo(id) {
    setOpen(false);
    if (!isHome) navigate("/#" + id);
  }

  const linkBase =
    "px-5 py-2.5 rounded-full text-base font-semibold transition-colors";

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md shadow-[0_2px_18px_rgba(11,31,51,0.07)]">
      <nav className="container-xl flex items-center justify-between h-20 md:h-24">
        <Link to="/" onClick={() => setOpen(false)} aria-label="AegisCare home">
          <Logo size={46} tagline />
        </Link>

        <div className="hidden md:flex items-center gap-2 lg:gap-3">
          {isHome &&
            NAV_LINKS.map((link) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                aria-current={active === link.id ? "page" : undefined}
                className={`${linkBase} ${
                  active === link.id
                    ? "bg-[#E3EEFF] text-azure-dark"
                    : "text-[#1B2B3C] hover:bg-[#EEF4FB] hover:text-azure-dark"
                }`}
              >
                {link.label}
              </a>
            ))}

          {isAuthenticated ? (
            <div className="flex items-center gap-3 ml-3">
              <Link
                to="/dashboard"
                className="flex items-center gap-2 text-base font-semibold text-ink hover:text-azure-dark transition-colors px-3 py-2"
              >
                <LayoutDashboard size={20} /> Dashboard
              </Link>
              <button
                onClick={() => {
                  logout();
                  navigate("/");
                }}
                className="flex items-center gap-2 text-base font-semibold px-5 py-2.5 rounded-full border-2 border-slate-light/50 text-ink hover:border-coral hover:text-[#C8323A] transition-colors"
              >
                <LogOut size={18} /> Log out
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="ml-3 flex items-center gap-2.5 text-base font-semibold px-7 py-3.5 rounded-full bg-ink text-white hover:bg-azure-dark transition-colors shadow-lg shadow-ink/20"
            >
              <LogIn size={20} /> Login
            </Link>
          )}
        </div>

        <button
          className="md:hidden text-ink p-2 -mr-2"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={open}
        >
          {open ? <X size={30} /> : <Menu size={30} />}
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="md:hidden bg-white border-t border-slate-light/30 overflow-hidden"
          >
            <div className="flex flex-col px-6 py-4 gap-1">
              {isHome &&
                NAV_LINKS.map((link) => (
                  <a
                    key={link.id}
                    href={`#${link.id}`}
                    onClick={() => goTo(link.id)}
                    className={`text-lg font-semibold py-3 px-4 rounded-xl ${
                      active === link.id ? "bg-[#E3EEFF] text-azure-dark" : "text-[#1B2B3C]"
                    }`}
                  >
                    {link.label}
                  </a>
                ))}
              {isAuthenticated ? (
                <>
                  <Link
                    to="/dashboard"
                    onClick={() => setOpen(false)}
                    className="text-lg font-semibold py-3 px-4 text-azure-dark"
                  >
                    Dashboard
                  </Link>
                  <button
                    onClick={() => {
                      logout();
                      setOpen(false);
                      navigate("/");
                    }}
                    className="text-lg font-semibold py-3 px-4 text-[#C8323A] text-left"
                  >
                    Log out
                  </button>
                </>
              ) : (
                <Link
                  to="/login"
                  onClick={() => setOpen(false)}
                  className="mt-2 flex items-center justify-center gap-2 text-lg font-semibold py-3.5 rounded-full bg-ink text-white"
                >
                  <LogIn size={20} /> Login
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

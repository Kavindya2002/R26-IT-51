import { Mail, Phone } from "lucide-react";
import Logo from "./Logo.jsx";

const LINKS = [
  { label: "Home", href: "/#home" },
  { label: "About", href: "/#about" },
  { label: "Features", href: "/#features" },
  { label: "Team", href: "/#team" },
  { label: "Contact", href: "/#contact" }
];

export default function Footer() {
  return (
    <footer className="bg-[#07151F] text-white">
      <div className="container-xl py-14 grid md:grid-cols-3 gap-10">
        <div>
          <Logo dark size={44} tagline />
          <p className="mt-5 text-base text-white/80 leading-relaxed max-w-sm">
            AegisCare is an Smart elderly care system that combines real-time fall risk monitoring, environmental risk detection and smart alerts to help prevent falls and improve the safety of older adults.
          </p>
        </div>

        <div>
          <h4 className="text-base font-bold tracking-wide text-white uppercase mb-5">Quick links</h4>
          <ul className="space-y-3 text-base text-white/80">
            {LINKS.map((l) => (
              <li key={l.label}>
                <a href={l.href} className="hover:text-signal transition-colors">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-base font-bold tracking-wide text-white uppercase mb-5">Contact</h4>
          <ul className="space-y-4 text-base text-white/80">
            <li className="flex items-center gap-3">
              <Mail size={20} className="text-signal shrink-0" />
              <a href="mailto:aegiscaresl@gmail.com" className="hover:text-signal transition-colors break-all">
                aegiscaresl@gmail.com
              </a>
            </li>
            <li className="flex items-center gap-3">
              <Phone size={20} className="text-signal shrink-0" />
              <a href="tel:+94776032717" className="hover:text-signal transition-colors">
                +94 77 603 2717
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/15 py-6">
        <p className="text-center text-sm text-white/70">
          © {new Date().getFullYear()} AegisCare · Safer Today • Healthier Tomorrow
        </p>
      </div>
    </footer>
  );
}

import Link from "next/link";
import { Shield, MapPin, BarChart3, Users, Clock, Vote, Github, Linkedin, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo, LogoIcon } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Logo size="md" />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/login">
              <Button variant="ghost" size="sm">Log in</Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="max-w-6xl mx-auto px-4 py-16 sm:py-24 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Elections made
            <span className="text-primary"> simple</span>
          </h1>
          <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Create region-based elections in minutes. Share a link with voters,
            track live results, and manage everything from one dashboard.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/register" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto text-base px-8">
                Create an Election
              </Button>
            </Link>
            <Link href="/login" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full sm:w-auto text-base px-8">
                Sign In
              </Button>
            </Link>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-4 pb-16 sm:pb-24">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            <FeatureCard
              icon={<MapPin className="h-6 w-6" />}
              title="Region-Based Access"
              description="Draw election regions on a map. Only voters within the defined area can participate."
            />
            <FeatureCard
              icon={<Shield className="h-6 w-6" />}
              title="One Vote Per Person"
              description="Email verification and device fingerprinting ensure each person votes only once."
            />
            <FeatureCard
              icon={<BarChart3 className="h-6 w-6" />}
              title="Live Dashboard"
              description="Watch votes come in with real-time charts, turnout tracking, and region breakdowns."
            />
            <FeatureCard
              icon={<Users className="h-6 w-6" />}
              title="Custom Voter Fields"
              description="Collect the information you need — names, IDs, departments, or any custom field."
            />
            <FeatureCard
              icon={<Clock className="h-6 w-6" />}
              title="Timed Windows"
              description="Set registration and voting windows. The system automatically opens and closes on schedule."
            />
            <FeatureCard
              icon={<Vote className="h-6 w-6" />}
              title="Multiple Elections"
              description="Run as many elections as you need, simultaneously, each fully independent."
            />
          </div>
        </section>
      </main>

      <footer className="border-t bg-card text-muted-foreground">
        <div className="max-w-6xl mx-auto px-4 py-10">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex flex-col items-center sm:items-start gap-2">
              <div className="flex items-center gap-2">
                <LogoIcon size={24} />
                <span className="font-bold text-lg text-foreground">
                  Elect<span className="text-emerald-500">Hub</span>
                </span>
              </div>
              <p className="text-sm">Secure election management platform</p>
            </div>

            <div className="flex flex-col items-center sm:items-end gap-2">
              <p className="text-sm">
                Built by{" "}
                <a
                  href="https://sadam.tech"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-500 font-medium hover:text-emerald-400 transition-colors"
                >
                  Sadam Husen Ali
                </a>
              </p>
              <div className="flex items-center gap-3">
                <a href="https://github.com/Urz1" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors" aria-label="GitHub">
                  <Github className="h-5 w-5" />
                </a>
                <a href="https://linkedin.com/in/sadam-husen-16s" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors" aria-label="LinkedIn">
                  <Linkedin className="h-5 w-5" />
                </a>
                <a href="https://sadam.tech" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors" aria-label="Portfolio">
                  <Globe className="h-5 w-5" />
                </a>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t text-center text-xs text-muted-foreground/60">
            <p>&copy; {new Date().getFullYear()} ElectHub. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-4">
        {icon}
      </div>
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
    </div>
  );
}

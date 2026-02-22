import Link from "next/link";
import { Vote, Shield, MapPin, BarChart3, Users, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Vote className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl">ElectHub</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost">Log in</Button>
            </Link>
            <Link href="/register">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="max-w-6xl mx-auto px-4 py-24 text-center">
          <h1 className="text-5xl font-bold tracking-tight text-gray-900 sm:text-6xl">
            Elections made
            <span className="text-primary"> simple</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Create region-based elections in minutes. Share a link with voters,
            track live results, and manage everything from one dashboard.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link href="/register">
              <Button size="lg" className="text-base px-8">
                Create an Election
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="text-base px-8">
                Sign In
              </Button>
            </Link>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-4 pb-24">
          <div className="grid md:grid-cols-3 gap-8">
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

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <p>ElectHub | Secure election management platform</p>
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
    <div className="rounded-xl border bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-4">
        {icon}
      </div>
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
    </div>
  );
}

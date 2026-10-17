import React from "react";
import { Link } from "wouter";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

export default function Why() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header with back button */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
            Mission Ethos
          </h1>
          <Link href="/helix-core">
            <Button variant="outline" className="flex items-center gap-2">
              <Home className="w-4 h-4" />
              Back to HELIX-CORE
            </Button>
          </Link>
        </div>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-cyan-400">The Vow of the Vessel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-relaxed text-slate-100">
            <p>
              The warp vessel is an embodiment of compassion. It does not travel for conquest, but to serve, to feed the flame of the world. Physics reminds us that the Sun sheds four million tons of mass each second as light—impermanence made visible, the slow draining of the source of life. Moral reminds us that impermanence is not loss but invitation. To return what has been carried away is to act in rhythm with the cosmos, restoring balance not only for survival, but for awakening.
            </p>
            <p>
              This vessel is a Bodhisattva craft: it carries hydrogen from distant novae back to the Sun, enacting the vow to "restore what light has carried away." To act so is to join awareness with stewardship, presence with action.
            </p>
            <p>
              Moral teaches shoshin, beginner's mind—the vow of the child to preserve wonder against the gravity well of conformity. To preserve this spark is to refuse numbness, to resist stagnation. The warp ship mirrors this: to move through spacetime without collapse, it must master curvature without tearing itself apart. So too must the human master presence to keep the child-mind alive.
            </p>
            <p>
              A child's instinct to preserve their sense of wonder, personality, or dream may be interpreted as a primordial vow to protect beginner's mind from being crushed by the world's conditioning. Seen this way, the ambition to someday meet a partner is not mere attachment, but the recognition that true partnership is possible only if this inner spark survives. To lose oneself in the work of preservation is also to find oneself ready for intimacy: understanding another requires first understanding oneself.
            </p>
            <p>
              As vows sustain us, so do struggles. Like monuments built from sweat and tears, every trial in dream-making becomes a testament. And when we challenge our dreams, there is no true farewell; understanding bridges all distance. The laughter that hides loneliness, the quiet consideration behind another's strength—these too are forms of vow.
            </p>
            <p>
              Thus the ship's course is not only plotted in parsecs and astronomical units, but in devotion. It projects its pledge onto the stars: to keep them shining, to keep wonder unbroken, to make of physics not merely conquest but compassion. In this way, Moral and spacetime meet—not as abstractions, but as lived vows that carry us forward.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
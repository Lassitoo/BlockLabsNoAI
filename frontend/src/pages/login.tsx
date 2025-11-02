import { useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const LoginPage = () => {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // ✅ Include user here directly
  const { login, user } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setError("");
  setLoading(true);
  try {
    const loggedInUser = await login(identifier, password);
    
    console.log("Logged in user:", loggedInUser);
    console.log("User role:", loggedInUser.role);
    
    // Redirect based on role
    if (loggedInUser.role === 'document_manager') {
      console.log("Redirecting to /document-manager");
      router.push("/document-manager/DocumentManagerDashboard");
    } else if (loggedInUser.role === 'expert') {
      console.log("Redirecting to /expert");
      router.push("/expert/ExpertDashboard");
    } else if (loggedInUser.role === 'admin') {
      console.log("Redirecting to /admin");
      router.push("/admin/AdminDashboard");
    } else {
      console.log("Unknown role, redirecting to /dashboard. Role:", loggedInUser.role);
      router.push("/dashboard");
    }
  } catch (err: any) {
    setError(err.message || "Login failed");
  } finally {
    setLoading(false);
  }
};


  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-white to-slate-50">
      {/* Navbar */}
      <nav className="w-full px-6 py-4 bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">B</span>
            </div>
            <span className="text-xl font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              BlockLabs
            </span>
          </div>
          <Button
            variant="ghost"
            onClick={() => router.push("/register")}
            className="text-slate-600 hover:text-slate-900"
          >
            Sign Up
          </Button>
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="text-center space-y-2 pb-6">
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Welcome Back
            </CardTitle>
            <CardDescription className="text-slate-600">
              Sign in to continue to BlockLabs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="identifier" className="text-slate-700 font-medium">
                  Username or Email
                </Label>
                <Input
                  id="identifier"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  className="h-11 border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                  placeholder="Enter your username or email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-700 font-medium">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                  placeholder="Enter your password"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium shadow-lg shadow-blue-500/30 transition-all"
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-slate-600 text-sm">
                Don't have an account?{" "}
                <button
                  className="text-blue-600 hover:text-blue-700 font-semibold hover:underline transition-colors"
                  onClick={() => router.push("/register")}
                >
                  Create one
                </button>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <footer className="py-6 text-center text-slate-500 text-sm">
        <p>© 2025 BlockLabs. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default LoginPage;

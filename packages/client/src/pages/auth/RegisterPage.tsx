import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterInput } from "@empcloud/shared";
import { useRegister } from "@/api/hooks";
import { useAuthStore } from "@/lib/auth-store";
import { Eye, EyeOff } from "lucide-react";

export default function RegisterPage() {
  const navigate = useNavigate();
  const registerMutation = useRegister();
  const setAuth = useAuthStore((s) => s.login);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { org_country: "IN" },
  });

  const onSubmit = async (data: RegisterInput) => {
    setError("");
    try {
      const result = await registerMutation.mutateAsync(data);
      setAuth(
        {
          id: result.user.id,
          email: result.user.email,
          first_name: result.user.first_name,
          last_name: result.user.last_name,
          role: result.user.role,
          org_id: result.org.id,
          org_name: result.org.name,
        },
        result.tokens
      );
      navigate("/onboarding");
    } catch (err: any) {
      setError(err.response?.data?.error?.message || "Registration failed");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <img src="/empcloud-logo.png" alt="EmpCloud" className="h-12 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900">Create your EMP Cloud account</h1>
          <p className="text-sm text-gray-500 mt-1">Set up your organization in minutes</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 space-y-5">
          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
          )}

          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Organization</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
              <input {...register("org_name")} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" placeholder="Acme Corp" />
              {errors.org_name && <p className="text-red-500 text-xs mt-1">{errors.org_name.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
              <input {...register("org_country")} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" placeholder="IN" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
              <input {...register("org_state")} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" placeholder="Karnataka" />
            </div>
          </div>

          <hr className="border-gray-200" />
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Admin Account</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
              <input {...register("first_name")} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
              {errors.first_name && <p className="text-red-500 text-xs mt-1">{errors.first_name.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <input {...register("last_name")} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
              {errors.last_name && <p className="text-red-500 text-xs mt-1">{errors.last_name.message}</p>}
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" {...register("email")} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" placeholder="admin@company.com" />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  {...register("password")}
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  placeholder="Min 8 chars, upper, lower, digit, special"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
            </div>
          </div>

          <button type="submit" disabled={isSubmitting} className="w-full bg-brand-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors">
            {isSubmitting ? "Creating account..." : "Create account"}
          </button>

          <p className="text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link to="/login" className="text-brand-600 hover:text-brand-700 font-medium">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

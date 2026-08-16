import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileForm } from "@/components/settings/profile-form";
import { LockerPinForm } from "@/components/settings/locker-pin-form";
import { SignOutButton } from "@/components/settings/sign-out-button";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your account.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>{user?.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm name={profile?.name ?? ""} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Locker PIN</CardTitle>
          <CardDescription>Set a 4-digit PIN to protect your Locker section.</CardDescription>
        </CardHeader>
        <CardContent>
          <LockerPinForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sign in options</CardTitle>
          <CardDescription>
            Email &amp; password is enabled. Google and Apple sign-in can be turned on later from your Supabase
            project without any changes to this app.
          </CardDescription>
        </CardHeader>
      </Card>

      <SignOutButton />
    </div>
  );
}

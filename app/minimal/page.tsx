import { redirect } from "next/navigation";

/** The minimal design is now the homepage. */
export default function MinimalRedirect() {
  redirect("/");
}

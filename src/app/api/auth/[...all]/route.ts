import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

// La instancia se crea en el primer pedido, no al compilar
export const GET = (request: Request) => toNextJsHandler(getAuth()).GET(request);
export const POST = (request: Request) => toNextJsHandler(getAuth()).POST(request);

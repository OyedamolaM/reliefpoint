import { describe,it,expect,afterEach,vi } from "vitest";
import { cleanup,screen,fireEvent,waitFor } from "@testing-library/react";
import { render } from "./render";
import { LiveCheckout } from "@/components/live-checkout";
import type { Product } from "@/lib/commerce";
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe("server-backed checkout",()=>{
 it("captures guest contact details before quoting and keeps them when payment is unavailable",async()=>{
  const id="00000000-0000-4000-8000-000000000001";const zone="00000000-0000-4000-8000-000000000002";
  const product:Product={id,name:"Product",category:"OTC",detail:"Pack",price:1000,image:"image.webp",inStock:true,prescription:false,deal:false,live:true};
  const request=vi.fn().mockImplementation(async(path:string)=>path.includes("zones")?Response.json({zones:[{id:zone,state:"Lagos",lga:"Ikeja",area:"",fee_kobo:200000,estimate:"Owner estimate"}]}):path.includes("checkout/quote")?Response.json({quote:{subtotal:100000,delivery:200000,processing:14721,total:314721,prescription:false,eta:"Owner estimate"}}):Response.json({error:{code:"PAYMENTS_UNAVAILABLE",message:"Online payment isn’t available yet. Please contact our pharmacy team."}},{status:503}));
  vi.stubGlobal("fetch",request);render(<LiveCheckout cart={[{product,quantity:1}]} onBack={()=>{}}/>);
  fireEvent.change(screen.getByLabelText("Full name"),{target:{value:"Amina Test"}});fireEvent.change(screen.getByLabelText("Email"),{target:{value:"amina@example.com"}});fireEvent.change(screen.getByLabelText("Nigerian phone number"),{target:{value:"08012345678"}});fireEvent.change(screen.getByLabelText("Street address"),{target:{value:"1 Test Street"}});
  await screen.findByRole("option",{name:"Lagos"});fireEvent.change(screen.getByLabelText("State / FCT"),{target:{value:"Lagos"}});fireEvent.change(screen.getByLabelText("Delivery area"),{target:{value:zone}});fireEvent.submit(screen.getByText("Continue to payment").closest("form")!);
  await screen.findByText("Processing fee");const quoteCall=request.mock.calls.find(call=>String(call[0]).includes("checkout/quote"));expect(JSON.parse(quoteCall![1].body).contact.email).toBe("amina@example.com");fireEvent.click(screen.getByRole("button",{name:/^Pay /}));await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent("Online payment isn’t available yet"));expect(screen.getByText("amina@example.com")).toBeInTheDocument();expect(request.mock.calls.some(call=>String(call[0]).includes("payments/initialize"))).toBe(false);
 });
});

import { describe,it,expect,afterEach } from "vitest";
import { cleanup,screen } from "@testing-library/react";
import { render } from "./render";
import { Article } from "@/components/blog";
import type { BlogPost } from "@/lib/contracts";
afterEach(cleanup);
describe("Health Tips content",()=>{
 it("renders structured articles safely with accessible photos and outbound Instagram links",()=>{
  const post:BlogPost={id:"post",title:"Everyday care",slug:"everyday-care",summary:"A practical article.",category:"Wellness",cover:"https://example.com/photo.webp",cover_alt:"A glass of water",blocks:[{type:"paragraph",text:'<script>alert("unsafe")</script>'},{type:"heading",text:"A small habit"},{type:"image",src:"https://example.com/inline.webp",alt:"A water bottle"}],instagram:"https://www.instagram.com/p/Example/",status:"published",author_name:"Pharmacy team",reviewer_id:null,published_at:"2026-11-21T00:00:00Z",updated_at:"2026-11-21T00:00:00Z"};
  const {container}=render(<Article post={post}/>);expect(container.querySelector("script")).toBeNull();expect(screen.getByText('<script>alert("unsafe")</script>')).toBeInTheDocument();expect(screen.getByAltText("A water bottle")).toBeInTheDocument();expect(screen.getByRole("link",{name:/View on Instagram/})).toHaveAttribute("rel","noopener noreferrer");expect(container.querySelector("iframe")).toBeNull();
 });
});

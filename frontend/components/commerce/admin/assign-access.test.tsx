import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AccessOptions, AssignAccessResult } from "@/types/access";

const options: AccessOptions = {
  courses: [{ id: 1, title: "Python basics", price: "5000.00", detail: "Published" }],
  exams: [
    { id: 7, title: "NRB mock", price: "0.00", detail: "Practice test · NRB officer" },
    { id: 8, title: "Loksewa mock", price: "300.00", detail: "Formal assessment" },
  ],
  batches: [],
};
const people = [{ id: 42, full_name: "Sunita Gurung", email: "sunita@example.com" }];

let posts: unknown[][] = [];
let respond: () => Promise<unknown> = () => Promise.resolve(undefined);
vi.mock("@/lib/api/client", () => ({
  api: {
    get: (path: string) => Promise.resolve(path === "/admin/access/options/" ? options : people),
    post: (...args: unknown[]) => {
      posts.push(args);
      return respond();
    },
  },
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ success: () => {}, error: () => {} }) }));

import { AssignAccess } from "./assign-access";

describe("AssignAccess", () => {
  beforeEach(() => {
    posts = [];
  });

  it("needs a person and an item before it can assign", async () => {
    render(<AssignAccess />);
    await screen.findByText("Python basics");
    expect(screen.getByRole("button", { name: "Assign access" })).toBeDisabled();
    await userEvent.click(screen.getByLabelText(/Python basics/));
    expect(screen.getByRole("button", { name: "Assign access" })).toBeDisabled();
  });

  it("sends the chosen people, courses and exams, then shows what changed", async () => {
    const result: AssignAccessResult = {
      added: 1,
      already_had: 1,
      results: [
        { user: 42, user_name: "Sunita Gurung", kind: "course", item: 1, title: "Python basics", added: false },
        { user: 42, user_name: "Sunita Gurung", kind: "exam", item: 7, title: "NRB mock", added: true },
      ],
    };
    respond = () => Promise.resolve(result);
    render(<AssignAccess />);

    await userEvent.type(screen.getByLabelText(/Find people/), "suni");
    const match = await screen.findByText("sunita@example.com");
    await userEvent.click(within(match.closest("li")!).getByRole("button", { name: "Add" }));
    expect(screen.getByRole("button", { name: "Remove Sunita Gurung" })).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText(/Python basics/));
    await userEvent.click(screen.getByLabelText(/NRB mock/));
    expect(screen.getByText("Ready to give 2 items to 1 person.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Assign access" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Assign access" }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual(["/admin/access/assign/", { users: [42], courses: [1], exams: [7] }]);
    expect(await screen.findByText(/Done: 1 item added, 1 already held/)).toBeInTheDocument();
    expect(screen.getByText("Added: NRB mock")).toBeInTheDocument();
    expect(screen.getByText("Already had: Python basics")).toBeInTheDocument();
  });

  it("starts with the person it was opened for", async () => {
    render(<AssignAccess initialPerson={people[0]} />);
    expect(screen.getByText("1 person chosen")).toBeInTheDocument();
    await screen.findByText("Loksewa mock");
  });
});

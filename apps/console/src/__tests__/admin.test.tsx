/**
 * Admin page tests — Wave 2 (Creator & platform management).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@liveflow/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@liveflow/api-client")>();
  return {
    ...actual,
    getToken: () => "mock-token",
    getAgencyId: () => "agency-1",
    listCreators: vi.fn(),
    createCreator: vi.fn(),
    connectAccount: vi.fn(),
    listConnectedAccounts: vi.fn(),
  };
});

import AdminPage from "@/app/(dashboard)/admin/page";
import * as apiClient from "@liveflow/api-client";

const mockListCreators = vi.mocked(apiClient.listCreators);
const mockCreateCreator = vi.mocked(apiClient.createCreator);
const mockConnectAccount = vi.mocked(apiClient.connectAccount);

const MOCK_CREATOR = {
  id: "creator-1",
  displayName: "Luna Star",
  email: "luna@agency.com",
  createdAt: "2026-01-01T00:00:00.000Z",
  platforms: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  mockListCreators.mockResolvedValue([]);
});

describe("AdminPage", () => {
  it("renders the Admin heading", async () => {
    render(<AdminPage />);
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("shows spinner while loading", () => {
    mockListCreators.mockReturnValue(new Promise(() => {}));
    render(<AdminPage />);
    expect(document.querySelector('[data-testid="spinner"], svg, [class*="spinner"], [class*="animate-spin"]')).toBeTruthy();
  });

  it("renders empty state when no creators exist", async () => {
    mockListCreators.mockResolvedValue([]);
    render(<AdminPage />);
    await waitFor(() => {
      expect(screen.getByText(/nessun creator registrato/i)).toBeInTheDocument();
    });
  });

  it("renders creator list when creators exist", async () => {
    mockListCreators.mockResolvedValue([MOCK_CREATOR]);
    render(<AdminPage />);
    await waitFor(() => {
      expect(screen.getByText("Luna Star")).toBeInTheDocument();
      expect(screen.getByText("luna@agency.com")).toBeInTheDocument();
    });
  });

  it("renders KPI tiles", async () => {
    mockListCreators.mockResolvedValue([MOCK_CREATOR]);
    render(<AdminPage />);
    await waitFor(() => {
      expect(screen.getByText("Creator")).toBeInTheDocument();
      expect(screen.getByText("Piattaforme")).toBeInTheDocument();
    });
  });

  it("shows new creator form when button is clicked", async () => {
    render(<AdminPage />);
    await waitFor(() => screen.getByText(/nuovo creator/i));
    fireEvent.click(screen.getByRole("button", { name: /nuovo creator/i }));
    expect(screen.getByText(/crea un account creator/i)).toBeInTheDocument();
  });

  it("submit button disabled when form is empty", async () => {
    render(<AdminPage />);
    await waitFor(() => screen.getByText(/nuovo creator/i));
    fireEvent.click(screen.getByRole("button", { name: /nuovo creator/i }));
    const submitBtn = screen.getByRole("button", { name: /crea creator/i });
    expect(submitBtn).toBeDisabled();
  });

  it("calls createCreator with correct payload", async () => {
    mockCreateCreator.mockResolvedValue({
      ...MOCK_CREATOR,
      email: "new@agency.com",
      displayName: "New Creator",
    });
    mockListCreators.mockResolvedValue([]);

    render(<AdminPage />);
    await waitFor(() => screen.getByText(/nuovo creator/i));
    fireEvent.click(screen.getByRole("button", { name: /nuovo creator/i }));

    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: "New Creator" },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "new@agency.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "password99" },
    });

    const submitBtn = screen.getByRole("button", { name: /crea creator/i });
    await waitFor(() => expect(submitBtn).not.toBeDisabled());
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockCreateCreator).toHaveBeenCalledWith(
        "agency-1",
        {
          displayName: "New Creator",
          email: "new@agency.com",
          password: "password99",
        },
        "mock-token",
      );
    });
  });

  it("shows credentials banner after successful creator creation", async () => {
    mockCreateCreator.mockResolvedValue({
      ...MOCK_CREATOR,
      email: "new@agency.com",
      displayName: "New Creator",
    });

    render(<AdminPage />);
    await waitFor(() => screen.getByText(/nuovo creator/i));
    fireEvent.click(screen.getByRole("button", { name: /nuovo creator/i }));

    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: "New Creator" },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "new@agency.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "password99" },
    });

    fireEvent.click(screen.getByRole("button", { name: /crea creator/i }));

    await waitFor(() => {
      expect(screen.getByText(/creator creata con successo/i)).toBeInTheDocument();
    });
  });

  it("shows error alert on 409 conflict", async () => {
    const conflictErr = new Error("409 Conflict");
    mockCreateCreator.mockRejectedValue(conflictErr);

    render(<AdminPage />);
    await waitFor(() => screen.getByText(/nuovo creator/i));
    fireEvent.click(screen.getByRole("button", { name: /nuovo creator/i }));

    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: "Someone" },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "existing@agency.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "password99" },
    });

    fireEvent.click(screen.getByRole("button", { name: /crea creator/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("connectAccount call is constructed with correct arguments", async () => {
    const mockAcct = {
      id: "acct-1",
      platform: "CHATURBATE" as const,
      platformUsername: "luna_cb",
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    mockConnectAccount.mockResolvedValue(mockAcct);
    mockListCreators.mockResolvedValue([MOCK_CREATOR]);

    render(<AdminPage />);
    await waitFor(() => screen.getByText("Luna Star"));

    // Expand creator row
    fireEvent.click(screen.getByRole("button", { name: /luna star/i }));

    await waitFor(() => screen.getByText(/aggiungi piattaforma/i));

    fireEvent.change(screen.getByLabelText(/username piattaforma/i), {
      target: { value: "luna_cb" },
    });
    fireEvent.change(screen.getByLabelText(/stream key/i), {
      target: { value: "live_abc123" },
    });

    fireEvent.click(screen.getByRole("button", { name: /salva/i }));

    await waitFor(() => {
      expect(mockConnectAccount).toHaveBeenCalledWith(
        "agency-1",
        "creator-1",
        expect.objectContaining({
          platformUsername: "luna_cb",
          streamKey: "live_abc123",
        }),
        "mock-token",
      );
    });
  });
});

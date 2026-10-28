// tests/permission-checker.test.ts — Règles de permission sur les trajets (SAD 7.7)

import { describe, expect, it } from "vitest";
import {
  canDeleteTrip,
  canJoinAsPassenger,
  canLeaveTrip,
  canModifyDepartureTime,
} from "@/lib/validators/permission-checker";
import { DRIVER, OTHER, PASSENGER, hoursFromNow, makePassenger, makeTrip } from "./helpers/fixtures";

describe("canDeleteTrip", () => {
  it("autorise toujours un admin", () => {
    const trip = makeTrip({ passengers: [makePassenger({ addedBy: "SELF" })] });
    expect(canDeleteTrip(trip, OTHER, true).allowed).toBe(true);
  });

  it("refuse un autre utilisateur que le conducteur", () => {
    expect(canDeleteTrip(makeTrip(), OTHER, false).allowed).toBe(false);
  });

  it("refuse le conducteur quand un passager s'est inscrit lui-même", () => {
    const trip = makeTrip({ passengers: [makePassenger({ addedBy: "SELF" })] });
    expect(canDeleteTrip(trip, DRIVER, false).allowed).toBe(false);
  });

  it("autorise le conducteur quand ses passagers ont tous été ajoutés par lui", () => {
    const trip = makeTrip({ passengers: [makePassenger({ addedBy: "DRIVER" })] });
    expect(canDeleteTrip(trip, DRIVER, false).allowed).toBe(true);
  });
});

describe("canModifyDepartureTime", () => {
  it("autorise toujours un admin", () => {
    const trip = makeTrip({ departureTime: hoursFromNow(1), passengers: [makePassenger()] });
    expect(canModifyDepartureTime(trip, OTHER, true).allowed).toBe(true);
  });

  it("refuse un autre utilisateur que le conducteur", () => {
    expect(canModifyDepartureTime(makeTrip(), OTHER, false).allowed).toBe(false);
  });

  it("refuse le conducteur à moins de 48 h quand un passager s'est inscrit", () => {
    const trip = makeTrip({ departureTime: hoursFromNow(47), passengers: [makePassenger({ addedBy: "SELF" })] });
    expect(canModifyDepartureTime(trip, DRIVER, false).allowed).toBe(false);
  });

  it("autorise le conducteur à plus de 48 h, même avec un passager inscrit", () => {
    const trip = makeTrip({ departureTime: hoursFromNow(49), passengers: [makePassenger({ addedBy: "SELF" })] });
    expect(canModifyDepartureTime(trip, DRIVER, false).allowed).toBe(true);
  });

  it("autorise le conducteur à moins de 48 h sans passager inscrit lui-même", () => {
    const trip = makeTrip({ departureTime: hoursFromNow(2), passengers: [makePassenger({ addedBy: "DRIVER" })] });
    expect(canModifyDepartureTime(trip, DRIVER, false).allowed).toBe(true);
  });
});

describe("canJoinAsPassenger", () => {
  const joinable = (overrides: Record<string, unknown> = {}) => ({ ...makeTrip(overrides), vehicleSeats: 5 });

  it("autorise un utilisateur sur un trajet futur avec des places", () => {
    expect(canJoinAsPassenger(joinable(), PASSENGER).allowed).toBe(true);
  });

  it("refuse un trajet annulé", () => {
    expect(canJoinAsPassenger(joinable({ status: "CANCELLED" }), PASSENGER).allowed).toBe(false);
  });

  it("refuse un trajet déjà parti", () => {
    expect(canJoinAsPassenger(joinable({ departureTime: hoursFromNow(-1) }), PASSENGER).allowed).toBe(false);
  });

  it("refuse le conducteur", () => {
    expect(canJoinAsPassenger(joinable(), DRIVER).allowed).toBe(false);
  });

  it("refuse un trajet complet (places du véhicule moins le conducteur)", () => {
    const passengers = [1, 2, 3, 4].map((n) => makePassenger({ id: `p${n}`, userSub: `user-${n}` }));
    expect(canJoinAsPassenger(joinable({ passengers }), PASSENGER).allowed).toBe(false);
  });
});

describe("canLeaveTrip", () => {
  it("autorise avant le départ", () => {
    expect(canLeaveTrip({ departureTime: hoursFromNow(1) }, false).allowed).toBe(true);
  });

  it("refuse après le départ", () => {
    expect(canLeaveTrip({ departureTime: hoursFromNow(-1) }, false).allowed).toBe(false);
  });

  it("autorise toujours un admin", () => {
    expect(canLeaveTrip({ departureTime: hoursFromNow(-1) }, true).allowed).toBe(true);
  });
});

"use client";
import { Bookmark, ChevronRight, Globe2, MapPin } from "lucide-react";
import { CountryCount } from "@/lib/stats";
import { Modal } from "./components";

export function Stats({
  been,
  want,
  countries,
  onCountries,
}: {
  been: number;
  want: number;
  countries: number;
  onCountries: () => void;
}) {
  return (
    <section className="stats" aria-label="Travel summary">
      <div>
        <span className="stat-icon">
          <MapPin size={20} />
        </span>
        <div>
          <strong>{been}</strong>
          <span>Visited</span>
        </div>
      </div>
      <div>
        <span className="stat-icon">
          <Globe2 size={20} />
        </span>
        <button
          type="button"
          className="stat-button"
          title="Show destinations by country or region"
          aria-haspopup="dialog"
          onClick={onCountries}
        >
          <strong>{countries}</strong>
          <span>Countries / regions</span>
        </button>
      </div>
      <div>
        <span className="stat-icon">
          <Bookmark size={20} />
        </span>
        <div>
          <strong>{want}</strong>
          <span>Wishlist</span>
        </div>
      </div>
    </section>
  );
}

export function CountryBreakdown({
  countries,
  onChoose,
  onClose,
}: {
  countries: CountryCount[];
  onChoose: (country: CountryCount) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Countries & regions" onClose={onClose}>
      {countries.length ? (
        <>
          <p className="muted small">
            Choose a location to filter the list.
          </p>
          <ul className="country-list">
            {countries.map((c) => (
              <li key={c.key}>
                <button
                  type="button"
                  className="country-option"
                  aria-label={`${c.label}: ${c.been} been, ${c.want} want to go`}
                  onClick={() => onChoose(c)}
                >
                  <span className="country-name">{c.label}</span>
                  <span className="country-counts">
                    <span title="Been">
                      <MapPin size={13} aria-hidden="true" /> {c.been}
                    </span>
                    <span title="Want to go">
                      <Bookmark size={13} aria-hidden="true" /> {c.want}
                    </span>
                  </span>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="muted">
          Add a country or region to a destination to see it here.
        </p>
      )}
    </Modal>
  );
}

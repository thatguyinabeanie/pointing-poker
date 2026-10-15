import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";

interface Props {
  deck: readonly string[];
  selected: string | null;
  disabled: boolean;
  onSelect: (card: string) => void;
  onClear: () => void;
}

export function Deck({ deck, selected, disabled, onSelect, onClear }: Props) {
  return (
    <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap" }} role="group" aria-label="Voting cards">
      {deck.map((card) => {
        const isSelected = card === selected;
        return (
          <Button
            key={card}
            variant={isSelected ? "contained" : "outlined"}
            aria-pressed={isSelected}
            disabled={disabled}
            // Toggle semantics match the server: voting the same card again clears it.
            onClick={() => (isSelected ? onClear() : onSelect(card))}
            sx={{ minWidth: 48, height: 64, fontSize: 20 }}
          >
            {card}
          </Button>
        );
      })}
    </Stack>
  );
}

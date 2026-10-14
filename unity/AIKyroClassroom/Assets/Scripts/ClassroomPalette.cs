using UnityEngine;

namespace AIKyro
{
    /// Mirrors the palette in src/components/classroom/ClassroomScene.tsx so the
    /// Unity room and the web room read as the same space.
    public static class ClassroomPalette
    {
        public static readonly Color Wall = Hex("#dcd4c0");
        public static readonly Color WallLower = Hex("#b9ae95");
        public static readonly Color Trim = Hex("#8d7f63");

        public static readonly Color Floor = Hex("#9a6f49");
        public static readonly Color FloorAlt = Hex("#8f6642");
        public static readonly Color FloorDark = Hex("#6f4e33");

        public static readonly Color Rug = Hex("#3f6b60");
        public static readonly Color RugEdge = Hex("#335549");

        public static readonly Color Wood = Hex("#b08455");
        public static readonly Color WoodDark = Hex("#7d5a37");
        public static readonly Color Metal = Hex("#55687a");
        public static readonly Color Brass = Hex("#c2a14e");
        public static readonly Color Dark = Hex("#273138");

        public static readonly Color Board = Hex("#16352e");
        public static readonly Color BoardFrame = Hex("#6f5436");
        public static readonly Color Chalk = Hex("#f6f3e9");
        public static readonly Color Felt = Hex("#4a4038");

        public static readonly Color Window = Hex("#bfe4e8");
        public static readonly Color Sky = Hex("#d9f0f2");
        public static readonly Color Glow = Hex("#fff3d4");
        public static readonly Color Curtain = Hex("#c7b9a0");

        public static readonly Color Teacher = Hex("#2f6f71");
        public static readonly Color Maya = Hex("#d06a52");
        public static readonly Color Arjun = Hex("#d7a83e");
        public static readonly Color Violet = Hex("#7a5aa0");

        public static readonly Color Poster = Hex("#e8dfc8");
        public static readonly Color Cork = Hex("#c08f5a");
        public static readonly Color Note = Hex("#f2e2a8");
        public static readonly Color Pencil = Hex("#d7a83e");
        public static readonly Color GlobeBlue = Hex("#4a7fa8");

        public static readonly Color Plant = Hex("#4a7d64");
        public static readonly Color PlantLight = Hex("#5d9476");
        public static readonly Color PlantPot = Hex("#a85f41");
        public static readonly Color PlantPotRim = Hex("#8f4f36");

        public static readonly Color Skin = Hex("#c08a63");
        public static readonly Color Trouser = Hex("#3d4654");
        public static readonly Color HairDark = Hex("#2e2420");
        public static readonly Color HairBlond = Hex("#b98b4e");
        public static readonly Color HairAuburn = Hex("#7a4230");

        public static readonly Color[] Books =
        {
            Hex("#b5543f"), Hex("#2f6f71"), Hex("#d7a83e"),
            Hex("#4a7d64"), Hex("#7a5aa0"), Hex("#c2724a")
        };

        public static Color Hex(string hex)
        {
            return ColorUtility.TryParseHtmlString(hex, out var c) ? c : Color.magenta;
        }
    }
}

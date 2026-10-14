using UnityEngine;

namespace AIKyro
{
    /// Builds the whole classroom from primitives at startup, using the same
    /// coordinates as the React Three Fiber scene. Nothing has to be authored by
    /// hand in the editor: drop this on one empty GameObject and press Play.
    public class ClassroomBuilder : MonoBehaviour
    {
        [Header("Optional character models")]
        [Tooltip("Leave empty to use the built-in jointed figures. Assign imported humanoid prefabs to swap in real avatars.")]
        public GameObject teacherPrefab;
        public GameObject mayaPrefab;
        public GameObject arjunPrefab;

        public ClassroomDirector Director { get; private set; }

        BoardText board;

        void Awake()
        {
            ApplyQuality();
            BuildShell();
            BuildBoard();
            BuildFurniture();
            BuildFittings();
            BuildLighting();

            var teacher = SpawnSpeaker(Speaker.Teacher, teacherPrefab, new Vector3(0f, 0f, -3.0f), Pose.Standing, ClassroomPalette.Teacher, ClassroomPalette.HairDark, 1f);
            var maya = SpawnSpeaker(Speaker.Maya, mayaPrefab, new Vector3(-2.8f, 0f, 0.62f), Pose.Seated, ClassroomPalette.Maya, ClassroomPalette.HairBlond, 1f);
            var arjun = SpawnSpeaker(Speaker.Arjun, arjunPrefab, new Vector3(2.8f, 0f, 0.62f), Pose.Seated, ClassroomPalette.Arjun, ClassroomPalette.HairDark, 1f);

            // Silent back row, so the room never looks like a three-person meeting.
            SpawnSpeaker(Speaker.Arjun, arjunPrefab, new Vector3(-2.7f, 0f, 3.92f), Pose.Seated, ClassroomPalette.Plant, ClassroomPalette.HairDark, 0.97f, false);
            SpawnSpeaker(Speaker.Maya, mayaPrefab, new Vector3(2.7f, 0f, 3.92f), Pose.Seated, ClassroomPalette.Violet, ClassroomPalette.HairAuburn, 0.97f, false);

            var rig = Camera.main != null ? Camera.main.gameObject : new GameObject("Main Camera", typeof(Camera));
            rig.tag = "MainCamera";
            var cameraRig = rig.GetComponent<CameraRig>() ?? rig.AddComponent<CameraRig>();

            Director = gameObject.AddComponent<ClassroomDirector>();
            Director.Configure(cameraRig, board, teacher, maya, arjun);

            gameObject.AddComponent<WebBridge>();
        }

        static void ApplyQuality()
        {
            QualitySettings.shadows = ShadowQuality.All;
            QualitySettings.shadowResolution = ShadowResolution.VeryHigh;
            QualitySettings.shadowDistance = 40f;
            QualitySettings.antiAliasing = 4;
            QualitySettings.softParticles = true;
        }

        // ---------- shell ----------

        void BuildShell()
        {
            Box("FloorBase", new Vector3(0f, -0.06f, 0f), new Vector3(18f, 0.12f, 20f), ClassroomPalette.FloorDark, 0.92f);

            // Plank strips give the floor a readable grain instead of one flat slab.
            for (var i = 0; i < 25; i++)
            {
                var z = -9.6f + i * 0.8f;
                var shade = i % 2 == 0 ? ClassroomPalette.Floor : ClassroomPalette.FloorAlt;
                Box($"Plank{i}", new Vector3(0f, 0.005f, z), new Vector3(17.9f, 0.02f, 0.74f), shade, 0.88f);
            }

            Box("Rug", new Vector3(0f, 0.02f, 1.6f), new Vector3(7.5f, 0.025f, 6f), ClassroomPalette.Rug, 0.97f);
            Box("RugBorder", new Vector3(0f, 0.018f, 1.6f), new Vector3(7.9f, 0.022f, 6.4f), ClassroomPalette.RugEdge, 0.97f);

            Box("Ceiling", new Vector3(0f, 6.65f, 0f), new Vector3(18f, 0.1f, 20f), ClassroomPalette.Chalk, 0.98f);
            for (var i = 0; i < 5; i++)
                Box($"Beam{i}", new Vector3(0f, 6.5f, -7f + i * 3.5f), new Vector3(18f, 0.22f, 0.3f), ClassroomPalette.Trim, 0.85f);

            Box("WallBack", new Vector3(0f, 3.3f, -5f), new Vector3(18f, 6.6f, 0.2f), ClassroomPalette.Wall, 0.95f);
            Box("WallBackLower", new Vector3(0f, 0.9f, -4.88f), new Vector3(18f, 1.8f, 0.06f), ClassroomPalette.WallLower, 0.9f);
            Box("WallBackRail", new Vector3(0f, 1.82f, -4.86f), new Vector3(18f, 0.1f, 0.09f), ClassroomPalette.Trim, 0.7f);
            Box("WallBackSkirting", new Vector3(0f, 0.12f, -4.86f), new Vector3(18f, 0.24f, 0.1f), ClassroomPalette.Trim, 0.75f);

            Box("WallLeft", new Vector3(-8.9f, 3.3f, 0f), new Vector3(0.2f, 6.6f, 20f), ClassroomPalette.Wall, 0.95f);
            Box("WallLeftSkirting", new Vector3(-8.78f, 0.12f, 0f), new Vector3(0.1f, 0.24f, 20f), ClassroomPalette.Trim, 0.75f);
            Box("WallRight", new Vector3(8.9f, 3.3f, 0f), new Vector3(0.2f, 6.6f, 20f), ClassroomPalette.Wall, 0.95f);
            Box("WallRightSkirting", new Vector3(8.78f, 0.12f, 0f), new Vector3(0.1f, 0.24f, 20f), ClassroomPalette.Trim, 0.75f);
            Box("WallFront", new Vector3(0f, 3.3f, 9.9f), new Vector3(18f, 6.6f, 0.2f), ClassroomPalette.Wall, 0.95f);

            BuildWindows();
            BuildDoor();
        }

        void BuildWindows()
        {
            foreach (var z in new[] { -1.4f, 2.4f })
            {
                var glass = Box($"Window{z}", new Vector3(-8.76f, 3.5f, z), new Vector3(0.08f, 3.1f, 2.5f), ClassroomPalette.Sky, 0.2f);
                Emissive(glass, ClassroomPalette.Sky, 1.1f);

                Box($"WindowSill{z}", new Vector3(-8.6f, 1.9f, z), new Vector3(0.42f, 0.1f, 2.8f), ClassroomPalette.Trim, 0.8f);
                Box($"WindowFrameV{z}", new Vector3(-8.7f, 3.5f, z), new Vector3(0.06f, 3.2f, 0.1f), ClassroomPalette.Trim, 0.8f);
                Box($"WindowFrameH{z}", new Vector3(-8.7f, 3.5f, z), new Vector3(0.06f, 0.1f, 2.6f), ClassroomPalette.Trim, 0.8f);
                Box($"WindowTop{z}", new Vector3(-8.7f, 5.12f, z), new Vector3(0.1f, 0.16f, 2.9f), ClassroomPalette.Trim, 0.8f);

                foreach (var side in new[] { -1f, 1f })
                    Box($"Curtain{z}{side}", new Vector3(-8.55f, 3.6f, z + side * 1.5f), new Vector3(0.1f, 3.5f, 0.55f), ClassroomPalette.Curtain, 0.95f);

                // A soft shaft of daylight landing on the floor.
                var shaft = Box($"Shaft{z}", new Vector3(-6.4f, 2.1f, z + 0.5f), new Vector3(4.6f, 3.0f, 2.2f), ClassroomPalette.Sky, 0.5f);
                shaft.transform.localRotation = Quaternion.Euler(0f, 0f, -34f);
                MakeTransparent(shaft, 0.07f);
                Destroy(shaft.GetComponent<Collider>());
            }
        }

        void BuildDoor()
        {
            Box("DoorFrame", new Vector3(8.8f, 1.6f, 3.4f), new Vector3(0.16f, 3.25f, 1.6f), ClassroomPalette.Trim, 0.8f);
            Box("Door", new Vector3(8.74f, 1.5f, 3.4f), new Vector3(0.12f, 3f, 1.35f), ClassroomPalette.WoodDark, 0.8f);
            Box("DoorPanelTop", new Vector3(8.67f, 2.2f, 3.4f), new Vector3(0.03f, 1f, 0.95f), ClassroomPalette.Wood, 0.8f);
            Box("DoorPanelLow", new Vector3(8.67f, 0.9f, 3.4f), new Vector3(0.03f, 1f, 0.95f), ClassroomPalette.Wood, 0.8f);
            Sphere("DoorKnob", new Vector3(8.66f, 1.45f, 3.95f), 0.12f, ClassroomPalette.Brass, 0.25f, 0.8f);
        }

        void BuildBoard()
        {
            Box("BoardFrame", new Vector3(0f, 3.7f, -4.84f), new Vector3(8.6f, 3.5f, 0.14f), ClassroomPalette.BoardFrame, 0.78f);
            Box("BoardSurface", new Vector3(0f, 3.72f, -4.74f), new Vector3(8.1f, 3.05f, 0.06f), ClassroomPalette.Board, 0.96f);
            Box("ChalkTray", new Vector3(0f, 2.04f, -4.64f), new Vector3(8.3f, 0.1f, 0.3f), ClassroomPalette.BoardFrame, 0.75f);
            Box("ChalkTrayLip", new Vector3(0f, 2.11f, -4.5f), new Vector3(8.3f, 0.08f, 0.05f), ClassroomPalette.WoodDark, 0.75f);

            foreach (var x in new[] { -0.9f, -0.62f, -0.34f })
            {
                var chalk = Box($"Chalk{x}", new Vector3(x, 2.14f, -4.6f), new Vector3(0.17f, 0.05f, 0.05f), ClassroomPalette.Chalk, 0.95f);
                Destroy(chalk.GetComponent<Collider>());
            }
            Box("Duster", new Vector3(1.1f, 2.16f, -4.6f), new Vector3(0.34f, 0.12f, 0.16f), ClassroomPalette.Felt, 0.9f);

            var holder = new GameObject("BoardText");
            holder.transform.SetParent(transform, false);
            holder.transform.position = new Vector3(0f, 3.8f, -4.68f);
            // TextMesh reads correctly only from its +Z side; the camera looks down -Z,
            // so without this half-turn every board line renders mirrored.
            holder.transform.localRotation = Quaternion.Euler(0f, 180f, 0f);

            var mesh = holder.AddComponent<TextMesh>();
            mesh.anchor = TextAnchor.MiddleCenter;
            mesh.alignment = TextAlignment.Center;
            mesh.color = ClassroomPalette.Chalk;
            mesh.fontSize = 70;
            mesh.characterSize = 0.1f;
            mesh.lineSpacing = 1.1f;
            mesh.font = BuiltinFont();

            var renderer = holder.GetComponent<MeshRenderer>();
            if (renderer != null && mesh.font != null) renderer.sharedMaterial = mesh.font.material;

            board = holder.AddComponent<BoardText>();
            board.SetText("AI KYRO");
        }

        static Font BuiltinFont()
        {
            // The builtin font was renamed in Unity 2022+; try both so the project
            // opens on either editor version without a missing-font error.
            var font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            if (font == null) font = Resources.GetBuiltinResource<Font>("Arial.ttf");
            return font;
        }

        // ---------- furniture ----------

        void BuildFurniture()
        {
            BuildTeacherDesk();

            Desk(new Vector3(-2.8f, 0f, -0.2f), -3f, true, false);
            Chair(new Vector3(-2.8f, 0f, 0.62f));
            Desk(new Vector3(2.8f, 0f, -0.2f), 3f, false, true);
            Chair(new Vector3(2.8f, 0f, 0.62f));

            Desk(new Vector3(-2.7f, 0f, 3.1f), 0f, true, true);
            Chair(new Vector3(-2.7f, 0f, 3.92f));
            Desk(new Vector3(2.7f, 0f, 3.1f), 0f, false, false);
            Chair(new Vector3(2.7f, 0f, 3.92f));

            Desk(new Vector3(0f, 0f, 5.4f), 0f, true, false);
            Chair(new Vector3(0f, 0f, 6.2f));
        }

        void BuildTeacherDesk()
        {
            var root = Group("TeacherDesk", new Vector3(0f, 0f, -3.95f));
            Child(root, Box("Top", new Vector3(0f, 0.84f, -3.95f), new Vector3(2.6f, 0.12f, 0.95f), ClassroomPalette.Wood, 0.6f));
            Child(root, Box("Body", new Vector3(0f, 0.42f, -3.98f), new Vector3(2.4f, 0.84f, 0.8f), ClassroomPalette.WoodDark, 0.8f));
            Child(root, Box("DrawerLine", new Vector3(0f, 0.62f, -3.57f), new Vector3(2.3f, 0.03f, 0.03f), ClassroomPalette.Trim, 0.8f));
            Child(root, Box("Paper", new Vector3(0.82f, 0.92f, -3.85f), new Vector3(0.36f, 0.02f, 0.26f), ClassroomPalette.Chalk, 0.9f));
            Child(root, Box("BookStack", new Vector3(-0.85f, 0.95f, -3.9f), new Vector3(0.4f, 0.1f, 0.3f), ClassroomPalette.Books[0], 0.85f));
            Child(root, Box("BookStack2", new Vector3(-0.85f, 1.04f, -3.9f), new Vector3(0.37f, 0.08f, 0.28f), ClassroomPalette.Books[1], 0.85f));

            // A globe reads instantly as "classroom" from any camera angle.
            Child(root, Sphere("Globe", new Vector3(0.1f, 1.12f, -4.1f), 0.34f, ClassroomPalette.GlobeBlue, 0.45f));
            Child(root, Cylinder("GlobeStand", new Vector3(0.1f, 0.93f, -4.1f), 0.07f, 0.2f, ClassroomPalette.Brass, 0.3f, 0.7f));
        }

        void Desk(Vector3 at, float yawDegrees, bool withBooks, bool withLaptop)
        {
            var root = Group("Desk", at);
            root.localRotation = Quaternion.Euler(0f, yawDegrees, 0f);

            Child(root, Box("Top", at + new Vector3(0f, 0.78f, 0f), new Vector3(1.8f, 0.1f, 0.72f), ClassroomPalette.Wood, 0.62f));
            Child(root, Box("Lip", at + new Vector3(0f, 0.72f, 0.3f), new Vector3(1.8f, 0.06f, 0.2f), ClassroomPalette.WoodDark, 0.7f));
            Child(root, Box("Sheet", at + new Vector3(-0.45f, 0.84f, 0.02f), new Vector3(0.3f, 0.012f, 0.42f), ClassroomPalette.Chalk, 0.92f));
            Child(root, Box("Pencil", at + new Vector3(-0.2f, 0.845f, -0.1f), new Vector3(0.015f, 0.015f, 0.2f), ClassroomPalette.Pencil, 0.6f));

            if (withBooks)
            {
                Child(root, Box("Book", at + new Vector3(0.5f, 0.86f, 0.02f), new Vector3(0.36f, 0.06f, 0.26f), ClassroomPalette.Books[2], 0.85f));
                Child(root, Box("Book2", at + new Vector3(0.5f, 0.91f, 0.02f), new Vector3(0.33f, 0.05f, 0.24f), ClassroomPalette.Books[3], 0.85f));
            }

            if (withLaptop)
            {
                Child(root, Box("LaptopBase", at + new Vector3(0.45f, 0.85f, 0.02f), new Vector3(0.4f, 0.03f, 0.28f), ClassroomPalette.Metal, 0.45f));
                var screen = Box("LaptopScreen", at + new Vector3(0.45f, 0.98f, -0.12f), new Vector3(0.4f, 0.26f, 0.025f), ClassroomPalette.Dark, 0.4f);
                screen.transform.localRotation = Quaternion.Euler(-18f, 0f, 0f);
                Emissive(screen, ClassroomPalette.Sky, 0.35f);
                Child(root, screen);
            }

            foreach (var x in new[] { -0.78f, 0.78f })
                foreach (var z in new[] { -0.24f, 0.24f })
                    Child(root, Cylinder("Leg", at + new Vector3(x, 0.39f, z), 0.035f, 0.78f, ClassroomPalette.Metal, 0.42f, 0.6f));
        }

        void Chair(Vector3 at)
        {
            var root = Group("Chair", at);
            Child(root, Box("Seat", at + new Vector3(0f, 0.45f, 0f), new Vector3(0.52f, 0.07f, 0.5f), ClassroomPalette.WoodDark, 0.7f));
            Child(root, Box("Back", at + new Vector3(0f, 0.76f, 0.23f), new Vector3(0.52f, 0.52f, 0.06f), ClassroomPalette.WoodDark, 0.7f));
            foreach (var x in new[] { -0.21f, 0.21f })
                foreach (var z in new[] { -0.21f, 0.21f })
                    Child(root, Cylinder("Leg", at + new Vector3(x, 0.22f, z), 0.022f, 0.45f, ClassroomPalette.Metal, 0.45f, 0.6f));
        }

        // ---------- fittings ----------

        void BuildFittings()
        {
            Bookshelf(new Vector3(7.4f, 0f, -3.4f));
            Poster(new Vector3(5.3f, 3.9f, -4.82f), ClassroomPalette.Teacher);
            Poster(new Vector3(-5.3f, 3.9f, -4.82f), ClassroomPalette.Maya);
            NoticeBoard(new Vector3(8.74f, 3.4f, -0.6f));
            Clock(new Vector3(0f, 5.65f, -4.78f));
            Plant(new Vector3(-7.6f, 0f, -3.2f));
            Plant(new Vector3(7.6f, 0f, 5.0f));
            Bin(new Vector3(6.4f, 0f, -4.2f));
        }

        void Bookshelf(Vector3 at)
        {
            var root = Group("Bookshelf", at);
            Child(root, Box("Case", at + new Vector3(0f, 1.1f, 0f), new Vector3(0.44f, 2.2f, 1.75f), ClassroomPalette.WoodDark, 0.8f));
            Child(root, Box("Top", at + new Vector3(0f, 2.24f, 0f), new Vector3(0.52f, 0.08f, 1.85f), ClassroomPalette.Wood, 0.75f));

            for (var shelf = 0; shelf < 3; shelf++)
            {
                var y = 0.45f + shelf * 0.55f;
                Child(root, Box("Shelf", at + new Vector3(0.02f, y - 0.04f, 0f), new Vector3(0.4f, 0.04f, 1.6f), ClassroomPalette.Wood, 0.75f));
                for (var i = 0; i < 9; i++)
                {
                    var h = 0.3f + ((i * 7 + shelf * 3) % 5) * 0.035f;
                    var colour = ClassroomPalette.Books[(i + shelf * 2) % ClassroomPalette.Books.Length];
                    var lean = (i * 5 + shelf) % 7 == 0 ? 11f : 0f;
                    var book = Box("Book", at + new Vector3(0.04f, y + h / 2f, -0.66f + i * 0.16f), new Vector3(0.3f, h, 0.12f), colour, 0.85f);
                    book.transform.localRotation = Quaternion.Euler(lean, 0f, 0f);
                    Child(root, book);
                }
            }
        }

        void Poster(Vector3 at, Color accent)
        {
            var root = Group("Poster", at);
            Child(root, Box("Frame", at + new Vector3(0f, 0f, 0.01f), new Vector3(1.62f, 1.17f, 0.03f), ClassroomPalette.Trim, 0.8f));
            Child(root, Box("Sheet", at, new Vector3(1.5f, 1.05f, 0.04f), ClassroomPalette.Poster, 0.92f));
            Child(root, Box("Band", at + new Vector3(0f, 0.36f, 0.04f), new Vector3(1.26f, 0.16f, 0.01f), accent, 0.8f));
            for (var i = 0; i < 4; i++)
                Child(root, Box("Line", at + new Vector3(-0.1f, 0.1f - i * 0.17f, 0.04f), new Vector3(i % 2 == 0 ? 1.02f : 0.78f, 0.035f, 0.01f), ClassroomPalette.Trim, 0.9f));
        }

        void NoticeBoard(Vector3 at)
        {
            var root = Group("NoticeBoard", at);
            Child(root, Box("Cork", at, new Vector3(0.06f, 1.6f, 2.6f), ClassroomPalette.Cork, 0.95f));
            Child(root, Box("Frame", at + new Vector3(-0.01f, 0f, 0f), new Vector3(0.04f, 1.72f, 2.74f), ClassroomPalette.Trim, 0.85f));

            var notes = new[] { -0.9f, -0.2f, 0.55f, 1.0f };
            for (var i = 0; i < notes.Length; i++)
            {
                var note = Box("Note", at + new Vector3(-0.05f, 0.35f - (i % 2) * 0.62f, notes[i]), new Vector3(0.02f, 0.46f, 0.36f), i % 2 == 0 ? ClassroomPalette.Chalk : ClassroomPalette.Note, 0.92f);
                note.transform.localRotation = Quaternion.Euler((i * 37f) % 9f - 4f, 0f, 0f);
                Child(root, note);
            }
        }

        void Clock(Vector3 at)
        {
            var root = Group("Clock", at);
            var body = Cylinder("Body", at, 0.28f, 0.08f, ClassroomPalette.Dark, 0.5f, 0.7f);
            body.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
            Child(root, body);
            Child(root, Box("Face", at + new Vector3(0f, 0f, 0.05f), new Vector3(0.44f, 0.44f, 0.01f), ClassroomPalette.Chalk, 0.85f));

            for (var i = 0; i < 12; i++)
            {
                var angle = i * Mathf.PI / 6f;
                Child(root, Box("Tick", at + new Vector3(Mathf.Sin(angle) * 0.17f, Mathf.Cos(angle) * 0.17f, 0.056f), new Vector3(0.022f, 0.022f, 0.01f), ClassroomPalette.Dark, 0.7f));
            }

            var hand = Box("Hand", at + new Vector3(0f, 0.05f, 0.06f), new Vector3(0.022f, 0.15f, 0.01f), ClassroomPalette.Dark, 0.6f);
            Child(root, hand);
            Child(root, Box("HandShort", at + new Vector3(0.04f, 0.03f, 0.062f), new Vector3(0.022f, 0.1f, 0.01f), ClassroomPalette.Maya, 0.6f));
            root.gameObject.AddComponent<ClockHand>().hand = hand.transform;
        }

        void Plant(Vector3 at)
        {
            var root = Group("Plant", at);
            Child(root, Cylinder("Pot", at + new Vector3(0f, 0.3f, 0f), 0.36f, 0.6f, ClassroomPalette.PlantPot, 0.85f));
            Child(root, Cylinder("PotRim", at + new Vector3(0f, 0.6f, 0f), 0.4f, 0.08f, ClassroomPalette.PlantPotRim, 0.85f));
            Child(root, Sphere("Canopy", at + new Vector3(0f, 1.2f, 0f), 1.4f, ClassroomPalette.Plant, 0.95f));
            Child(root, Sphere("CanopyB", at + new Vector3(0.32f, 0.88f, 0.16f), 0.76f, ClassroomPalette.PlantLight, 0.95f));
            Child(root, Sphere("CanopyC", at + new Vector3(-0.28f, 0.95f, -0.2f), 0.66f, ClassroomPalette.Plant, 0.95f));
        }

        void Bin(Vector3 at)
        {
            var root = Group("Bin", at);
            Child(root, Cylinder("Body", at + new Vector3(0f, 0.28f, 0f), 0.24f, 0.56f, ClassroomPalette.Metal, 0.5f, 0.6f));
            Child(root, Cylinder("Rim", at + new Vector3(0f, 0.56f, 0f), 0.26f, 0.05f, ClassroomPalette.Dark, 0.5f, 0.6f));
        }

        // ---------- lighting ----------

        void BuildLighting()
        {
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = ClassroomPalette.Sky * 0.6f;
            RenderSettings.ambientEquatorColor = ClassroomPalette.Wall * 0.5f;
            RenderSettings.ambientGroundColor = ClassroomPalette.Floor * 0.35f;
            RenderSettings.fog = true;
            RenderSettings.fogColor = ClassroomPalette.Wall;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogStartDistance = 20f;
            RenderSettings.fogEndDistance = 42f;

            var sun = new GameObject("Sun").AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.transform.position = new Vector3(-7f, 9f, 4f);
            sun.transform.rotation = Quaternion.Euler(38f, 48f, 0f);
            sun.color = ClassroomPalette.Glow;
            sun.intensity = 1.25f;
            sun.shadows = LightShadows.Soft;
            sun.shadowStrength = 0.62f;

            // Cool bounce from the window wall, so the room is not lit from one side only.
            var fill = new GameObject("WindowFill").AddComponent<Light>();
            fill.type = LightType.Directional;
            fill.transform.rotation = Quaternion.Euler(16f, -115f, 0f);
            fill.color = ClassroomPalette.Sky;
            fill.intensity = 0.4f;
            fill.shadows = LightShadows.None;

            foreach (var z in new[] { -2.4f, 2.4f })
            {
                var tube = Box($"CeilingLight{z}", new Vector3(0f, 6.32f, z), new Vector3(2.6f, 0.1f, 0.42f), ClassroomPalette.Chalk, 0.4f);
                Emissive(tube, ClassroomPalette.Glow, 1.6f);
                Box($"CeilingHousing{z}", new Vector3(0f, 6.42f, z), new Vector3(2.76f, 0.14f, 0.6f), ClassroomPalette.Metal, 0.5f);
                foreach (var x in new[] { -1.1f, 1.1f })
                    Box($"LightRod{z}{x}", new Vector3(x, 6.55f, z), new Vector3(0.04f, 0.26f, 0.04f), ClassroomPalette.Metal, 0.5f);

                var bulb = new GameObject($"CeilingBulb{z}").AddComponent<Light>();
                bulb.type = LightType.Point;
                bulb.transform.position = new Vector3(0f, 5.8f, z);
                bulb.color = ClassroomPalette.Glow;
                bulb.intensity = 2.1f;
                bulb.range = 13f;
            }

            // Washes the chalkboard so the writing never falls into shadow.
            var boardWash = new GameObject("BoardWash").AddComponent<Light>();
            boardWash.type = LightType.Point;
            boardWash.transform.position = new Vector3(0f, 4.6f, -3.1f);
            boardWash.color = ClassroomPalette.Glow;
            boardWash.intensity = 1.5f;
            boardWash.range = 7f;
        }

        // ---------- speakers ----------

        enum Pose { Standing, Seated }

        SpeakerAvatar SpawnSpeaker(Speaker role, GameObject prefab, Vector3 at, Pose pose, Color outfit, Color hair, float scale, bool canSpeak = true)
        {
            GameObject go;

            if (prefab != null)
            {
                go = Instantiate(prefab, at, Quaternion.identity);
            }
            else
            {
                go = new GameObject($"Figure_{role}");
                go.transform.position = at;
                BuildFigure(go.transform, pose, outfit, hair);
            }

            go.transform.localScale = Vector3.one * scale;
            // The teacher faces the class; everyone else faces the board.
            go.transform.LookAt(new Vector3(0f, at.y, role == Speaker.Teacher ? 6f : -3.2f));

            var avatar = go.AddComponent<SpeakerAvatar>();
            avatar.Configure(role, canSpeak, ClassroomPalette.Glow);
            return avatar;
        }

        /// A jointed figure built in local space with forward = +Z, so Transform.LookAt
        /// orients it correctly. Crude, but it reads as a person rather than a capsule.
        void BuildFigure(Transform root, Pose pose, Color outfit, Color hair)
        {
            var skin = ClassroomPalette.Skin;
            var trouser = ClassroomPalette.Trouser;

            if (pose == Pose.Standing)
            {
                Local(root, Cylinder("LegL", new Vector3(-0.12f, 0.4f, 0f), 0.09f, 0.8f, trouser, 0.85f));
                Local(root, Cylinder("LegR", new Vector3(0.12f, 0.4f, 0f), 0.09f, 0.8f, trouser, 0.85f));
                Local(root, Box("ShoeL", new Vector3(-0.12f, 0.04f, 0.06f), new Vector3(0.16f, 0.08f, 0.28f), ClassroomPalette.Dark, 0.8f));
                Local(root, Box("ShoeR", new Vector3(0.12f, 0.04f, 0.06f), new Vector3(0.16f, 0.08f, 0.28f), ClassroomPalette.Dark, 0.8f));

                Local(root, Box("Torso", new Vector3(0f, 1.13f, 0f), new Vector3(0.46f, 0.68f, 0.26f), outfit, 0.8f));
                Local(root, Box("Hips", new Vector3(0f, 0.8f, 0f), new Vector3(0.4f, 0.16f, 0.24f), trouser, 0.85f));
                Local(root, Cylinder("ArmL", new Vector3(-0.3f, 1.12f, 0f), 0.065f, 0.62f, outfit, 0.8f));
                Local(root, Cylinder("ArmR", new Vector3(0.3f, 1.12f, 0f), 0.065f, 0.62f, outfit, 0.8f));
                Local(root, Sphere("HandL", new Vector3(-0.3f, 0.8f, 0f), 0.13f, skin, 0.85f));
                Local(root, Sphere("HandR", new Vector3(0.3f, 0.8f, 0f), 0.13f, skin, 0.85f));

                BuildHead(root, 1.62f, skin, hair);
                return;
            }

            // Seated: hips on the chair, thighs forward, shins down, hands toward the desk.
            Local(root, Box("Hips", new Vector3(0f, 0.52f, 0f), new Vector3(0.42f, 0.18f, 0.3f), trouser, 0.85f));
            foreach (var side in new[] { -1f, 1f })
            {
                var thigh = Cylinder($"Thigh{side}", new Vector3(side * 0.13f, 0.53f, -0.22f), 0.085f, 0.46f, trouser, 0.85f);
                thigh.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
                Local(root, thigh);
                Local(root, Cylinder($"Shin{side}", new Vector3(side * 0.13f, 0.25f, -0.44f), 0.075f, 0.5f, trouser, 0.85f));
                Local(root, Box($"Shoe{side}", new Vector3(side * 0.13f, 0.04f, -0.5f), new Vector3(0.15f, 0.08f, 0.27f), ClassroomPalette.Dark, 0.8f));
            }

            Local(root, Box("Torso", new Vector3(0f, 0.9f, -0.02f), new Vector3(0.44f, 0.6f, 0.25f), outfit, 0.8f));
            Local(root, Box("Collar", new Vector3(0f, 1.18f, -0.02f), new Vector3(0.3f, 0.08f, 0.22f), ClassroomPalette.Chalk, 0.85f));

            foreach (var side in new[] { -1f, 1f })
            {
                var upper = Cylinder($"Arm{side}", new Vector3(side * 0.28f, 0.95f, -0.04f), 0.062f, 0.44f, outfit, 0.8f);
                upper.transform.localRotation = Quaternion.Euler(22f, 0f, 0f);
                Local(root, upper);
                var fore = Cylinder($"Fore{side}", new Vector3(side * 0.26f, 0.76f, -0.3f), 0.058f, 0.42f, skin, 0.85f);
                fore.transform.localRotation = Quaternion.Euler(78f, 0f, 0f);
                Local(root, fore);
                Local(root, Sphere($"Hand{side}", new Vector3(side * 0.25f, 0.74f, -0.48f), 0.12f, skin, 0.85f));
            }

            BuildHead(root, 1.38f, skin, hair);
        }

        void BuildHead(Transform root, float y, Color skin, Color hair)
        {
            Local(root, Cylinder("Neck", new Vector3(0f, y - 0.19f, 0f), 0.06f, 0.14f, skin, 0.85f));
            Local(root, Sphere("Head", new Vector3(0f, y, 0f), 0.34f, skin, 0.82f));

            var cap = Sphere("Hair", new Vector3(0f, y + 0.06f, -0.02f), 0.35f, hair, 0.9f);
            cap.transform.localScale = new Vector3(0.36f, 0.26f, 0.36f);
            Local(root, cap);

            // Eyes read at a distance and stop the heads looking like eggs.
            foreach (var side in new[] { -1f, 1f })
            {
                var eye = Sphere($"Eye{side}", new Vector3(side * 0.08f, y + 0.02f, 0.15f), 0.07f, ClassroomPalette.Dark, 0.4f);
                Local(root, eye);
            }
        }

        // ---------- primitive helpers ----------

        Transform Group(string name, Vector3 at)
        {
            var go = new GameObject(name);
            go.transform.SetParent(transform, false);
            go.transform.position = at;
            return go.transform;
        }

        static void Child(Transform parent, GameObject go) => go.transform.SetParent(parent, true);

        /// Re-parents a primitive built at world origin into a figure's local space.
        static void Local(Transform parent, GameObject go)
        {
            var offset = go.transform.position;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = offset;
        }

        GameObject Box(string name, Vector3 at, Vector3 size, Color colour, float roughness)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = name;
            go.transform.SetParent(transform, false);
            go.transform.position = at;
            go.transform.localScale = size;
            Paint(go, colour, roughness, 0f);
            return go;
        }

        GameObject Cylinder(string name, Vector3 at, float radius, float height, Color colour, float roughness, float metallic = 0f)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            go.name = name;
            go.transform.SetParent(transform, false);
            go.transform.position = at;
            go.transform.localScale = new Vector3(radius * 2f, height / 2f, radius * 2f);
            Paint(go, colour, roughness, metallic);
            return go;
        }

        GameObject Sphere(string name, Vector3 at, float diameter, Color colour, float roughness, float metallic = 0f)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            go.name = name;
            go.transform.SetParent(transform, false);
            go.transform.position = at;
            go.transform.localScale = Vector3.one * diameter;
            Paint(go, colour, roughness, metallic);
            return go;
        }

        static void Paint(GameObject go, Color colour, float roughness, float metallic)
        {
            var renderer = go.GetComponent<MeshRenderer>();
            if (renderer == null) return;

            var material = new Material(Shader.Find("Standard")) { color = colour };
            material.SetFloat("_Glossiness", Mathf.Clamp01(1f - roughness));
            material.SetFloat("_Metallic", Mathf.Clamp01(metallic));
            renderer.sharedMaterial = material;
        }

        static void Emissive(GameObject go, Color colour, float intensity)
        {
            var renderer = go.GetComponent<MeshRenderer>();
            if (renderer == null) return;

            var material = renderer.sharedMaterial;
            material.EnableKeyword("_EMISSION");
            material.SetColor("_EmissionColor", colour * intensity);
        }

        static void MakeTransparent(GameObject go, float alpha)
        {
            var renderer = go.GetComponent<MeshRenderer>();
            if (renderer == null) return;

            var material = renderer.sharedMaterial;
            material.SetFloat("_Mode", 3f);
            material.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
            material.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            material.SetInt("_ZWrite", 0);
            material.DisableKeyword("_ALPHATEST_ON");
            material.EnableKeyword("_ALPHABLEND_ON");
            material.DisableKeyword("_ALPHAPREMULTIPLY_ON");
            material.renderQueue = 3000;

            var c = material.color;
            material.color = new Color(c.r, c.g, c.b, alpha);
        }
    }
}

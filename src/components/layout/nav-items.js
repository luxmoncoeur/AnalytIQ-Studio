import {
  BookOpenText,
  ChartScatter,
  FlaskConical,
  Info,
  LayoutDashboard,
  Sigma,
} from "lucide-react";

export const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, description: "Start here" },
    ],
  },
  {
    label: "Analyses",
    items: [
      {
        title: "Linear Regression",
        href: "/regression",
        icon: ChartScatter,
        description: "Ŷ = a + bX and r",
      },
      {
        title: "Hypothesis Testing",
        href: "/hypothesis",
        icon: FlaskConical,
        description: "Z-tests",
      },
      {
        title: "t-Tests",
        href: "/t-test",
        icon: Sigma,
        description: "One, two & paired",
      },
    ],
  },
  {
    label: "Learn",
    items: [
      { title: "Formulas & Tables", href: "/learn", icon: BookOpenText, description: "Reference" },
      { title: "About", href: "/about", icon: Info, description: "BSIT-3A" },
    ],
  },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

import { getGithubUser } from "../handlers/github_handlers";

export async function getGitAuthor() {
  const user = await getGithubUser();
  const author = user
    ? {
        name: `[spawn]`,
        email: user.email,
      }
    : {
        name: "[spawn]",
        email: "git@spawn.sh",
      };
  return author;
}

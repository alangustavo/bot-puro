export function formatAllDate(input: number): string {

    let date: Date;
    let date1 = new Date(input);
    let date2 = new Date(input * 1000);
    let date3 = new Date(input / 1000);
    let year1 = date1.getFullYear();
    let year2 = date2.getFullYear();
    let year3 = date3.getFullYear();

    const minYear = 2000;
    const maxYear = 2100;

    // If year is out of range, try as seconds
    if (year1 > minYear && year1 < maxYear) {
        date = date1;
        const year = date.getFullYear();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const shortYear = year.toString().slice(-2);

        return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${shortYear} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    } else if (year2 > minYear && year2 < maxYear) {
        date = date2;
        const year = date.getFullYear();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const shortYear = year.toString().slice(-2);

        return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${shortYear} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    } else if (year3 > minYear && year3 < maxYear) {
        date = date3;
        const year = date.getFullYear();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const shortYear = year.toString().slice(-2);
        return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${shortYear} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }
    return 'Invalid date';

}


export function addSecondsToDate(input: number, secondsToAdd: number): Date | null {
    let date: Date;
    let date1 = new Date(input);
    let date2 = new Date(input * 1000);
    let date3 = new Date(input / 1000);
    let year1 = date1.getFullYear();
    let year2 = date2.getFullYear();
    let year3 = date3.getFullYear();

    const minYear = 2000;
    const maxYear = 2100;

    if (year1 > minYear && year1 < maxYear) {
        date = new Date(date1.getTime() + secondsToAdd * 1000);
    } else if (year2 > minYear && year2 < maxYear) {
        date = new Date(date2.getTime() + secondsToAdd * 1000);
    } else if (year3 > minYear && year3 < maxYear) {
        date = new Date(date3.getTime() + secondsToAdd * 1000);
    } else {
        return null;
    }

    return date;
}

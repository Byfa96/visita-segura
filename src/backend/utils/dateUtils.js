class DateUtils {
  static getCurrentDate() {
    const fecha = new Date();
    return fecha.toISOString().split('T')[0];
  }


  static getCurrentTime() {
    const fecha = new Date();
    return fecha.toTimeString().split(' ')[0];
  }


  static formatDateTime(date) {
    return {
      fecha: date.toISOString().split('T')[0],
      hora: date.toTimeString().split(' ')[0]
    };
  }
}


module.exports = DateUtils;
